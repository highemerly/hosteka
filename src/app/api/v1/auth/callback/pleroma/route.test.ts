import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COOKIE_OAUTH_SESSION } from '@/lib/cookie-names'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))

/*
  宛先の確認（`remoteFetch` が毎回呼ぶ）は名前を引く。モックしないと
  テストが DNS に依存する。判定そのものは `outbound-host.test.ts` が見ている。
*/
vi.mock('@/server/auth/outbound-host', () => ({ checkOutboundHost: async () => null }))

import { prismaMock, resetPrismaMock } from '@/test/contract'

const issueSessionRedirect = vi.fn()
vi.mock('@/server/auth/oauth-callback', () => ({
  issueSessionRedirect: (...args: unknown[]) => issueSessionRedirect(...args),
}))
vi.mock('@/server/auth/terms', () => ({ recordTermsAcceptance: async () => undefined }))
vi.mock('@/lib/user-tracking', () => ({
  checkBannedUser: async () => false,
  updateUserLoginInfo: async () => undefined,
}))
vi.mock('@/lib/webfinger', () => ({ verifyUserWithWebFinger: async () => ({ valid: true }) }))

import { encrypt, encryptAccessToken } from '@/lib/crypto'

import { GET } from './route'

/**
 * Pleroma のコールバック。**接続情報は register が発行した暗号化 Cookie から
 * だけ読む**（Mastodon と同じ）。
 */
const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  resetPrismaMock()
  issueSessionRedirect.mockReset()
  issueSessionRedirect.mockImplementation(async () => NextResponse.redirect('https://hosteka.test/'))
  process.env.NEXTAUTH_SECRET = 'test-secret-test-secret-test-secret'
  process.env.NEXTAUTH_URL = 'https://hosteka.test'
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.env = { ...ORIGINAL_ENV }
})

function callback(
  state: Record<string, unknown>,
  cookie: { platform: 'mastodon' | 'pleroma' } | null = { platform: 'pleroma' }
) {
  const session = cookie
    ? encrypt({
        server: 'pleroma.social',
        appId: 'app_1',
        csrf: 'c',
        scopes: 'read:accounts',
        platform: cookie.platform,
        createdAt: Date.now(),
      })
    : null
  const encoded = Buffer.from(JSON.stringify(state)).toString('base64url')
  return GET(
    new NextRequest(`https://hosteka.test/api/v1/auth/callback/pleroma?code=x&state=${encoded}`, {
      headers: session ? { cookie: `${COOKIE_OAUTH_SESSION}=${session}` } : {},
    })
  )
}

describe('Pleroma のコールバック', () => {
  /**
   * **接続情報は Cookie からだけ読む。** state は署名されておらず、
   * そこから読むと、攻撃者のアプリの情報と認可コードを詰めたリンクを
   * 踏ませるだけで、踏んだ人を攻撃者のアカウントでログインさせられる。
   */
  it('Cookie が無ければ、state に接続情報があっても進めない', async () => {
    const response = await callback(
      {
        csrf: 'c',
        timestamp: Date.now(),
        callbackUrl: '/',
        server: 'evil.example',
        client_id: 'attacker-app',
        client_secret: 'attacker-secret',
      },
      null
    )

    expect(response.headers.get('location')).toContain('/auth/error?error=missing_session')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('Mastodon のログインで発行された Cookie では進めない', async () => {
    const response = await callback(
      { csrf: 'c', timestamp: Date.now(), callbackUrl: '/' },
      { platform: 'mastodon' }
    )

    expect(response.headers.get('location')).toContain('/auth/error?error=missing_session')
  })

  /**
   * **state の csrf を Cookie の値と突き合わせる。** 別のログインで出た
   * 認可コードと state を持ち込まれても、このブラウザで始めたログインで
   * なければ通さない。
   */
  it('state の csrf が Cookie と違えば進めない', async () => {
    const response = await callback({ csrf: 'other', timestamp: Date.now(), callbackUrl: '/' })

    expect(response.headers.get('location')).toContain('/auth/error?error=invalid_state')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('Cookie のアプリが別のサーバーのものなら進めない', async () => {
    prismaMock.oauthApp.findUnique.mockResolvedValue({
      id: 'app_1',
      platform: 'pleroma',
      server: 'evil.example',
      clientId: 'cid',
      clientSecret: encrypt({ secret: 'secret' }),
    })
    const response = await callback({ csrf: 'c', timestamp: Date.now(), callbackUrl: '/' })

    expect(response.headers.get('location')).toContain('/auth/error?error=missing_session')
    expect(fetch).not.toHaveBeenCalled()
  })

  /** シークレットは Cookie ではなく DB のアプリから取る */
  it('トークンの交換には、DB に置いたアプリの認証情報を使う', async () => {
    prismaMock.oauthApp.findUnique.mockResolvedValue({
      id: 'app_1',
      platform: 'pleroma',
      server: 'pleroma.social',
      clientId: 'db-client',
      clientSecret: encrypt({ secret: 'db-secret' }),
    })
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 400 }))

    const response = await callback({ csrf: 'c', timestamp: Date.now(), callbackUrl: '/' })

    expect(response.headers.get('location')).toContain('/auth/error?error=token_exchange_failed')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://pleroma.social/oauth/token')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      client_id: 'db-client',
      client_secret: 'db-secret',
      redirect_uri: 'https://hosteka.test/api/v1/auth/callback/pleroma',
    })
  })
})

/**
 * ログインし直したら、前のトークンを失効させる。アプリを使い回しているので、
 * 前のトークンも同じアプリで発行されていれば失効できる。
 */
describe('Pleroma で入り直したときの前のトークン', () => {
  function loginSucceeds() {
    prismaMock.oauthApp.findUnique.mockResolvedValue({
      id: 'app_1',
      platform: 'pleroma',
      server: 'pleroma.social',
      clientId: 'db-client',
      clientSecret: encrypt({ secret: 'db-secret' }),
    })
    prismaMock.oauthApp.findMany.mockResolvedValue([])
    prismaMock.user.upsert.mockImplementation(async ({ create }: { create: object }) => ({
      id: 'user_1',
      lastTermsAcceptedAt: new Date(),
      ...create,
    }))
    vi.mocked(fetch).mockImplementation(async (url) => {
      const u = String(url)
      if (u.endsWith('/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'new-token', scope: 'read:accounts' }))
      }
      if (u.endsWith('/verify_credentials')) {
        return new Response(JSON.stringify({ username: 'taro', display_name: 'Taro' }))
      }
      return new Response('{}')
    })
  }

  const revokeCalls = () =>
    vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === 'https://pleroma.social/oauth/revoke')

  it('前のトークンを、使い回しているアプリの認証情報で失効させる', async () => {
    loginSucceeds()
    prismaMock.user.findUnique.mockResolvedValue({
      platform: 'pleroma',
      accessToken: encryptAccessToken('old-token'),
    })

    await callback({ csrf: 'c', timestamp: Date.now(), callbackUrl: '/' })

    expect(issueSessionRedirect).toHaveBeenCalledTimes(1)
    expect(revokeCalls()).toHaveLength(1)
    expect(JSON.parse(String(revokeCalls()[0][1]?.body))).toEqual({
      client_id: 'db-client',
      client_secret: 'db-secret',
      token: 'old-token',
    })
    // 新しいトークンを保存してから失効させる
    expect(prismaMock.user.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(fetch).mock.invocationCallOrder.at(-1)!
    )
  })

  /**
   * アプリは求める権限の組ごとに分かれる。読み取りだけから投稿の権限つきへ
   * 入り直すと、前のトークンは別のアプリが発行している。
   */
  it('今回のアプリで断られたら、同じサーバーの別のアプリで失効させる', async () => {
    loginSucceeds()
    prismaMock.oauthApp.findMany.mockResolvedValue([
      { id: 'app_1', platform: 'pleroma', server: 'pleroma.social', clientId: 'db-client', clientSecret: encrypt({ secret: 'db-secret' }) },
      { id: 'app_read', platform: 'pleroma', server: 'pleroma.social', clientId: 'read-client', clientSecret: encrypt({ secret: 'read-secret' }) },
      { id: 'app_other', platform: 'pleroma', server: 'pleroma.social', clientId: 'other-client', clientSecret: encrypt({ secret: 'other-secret' }) },
    ])
    prismaMock.user.findUnique.mockResolvedValue({
      platform: 'pleroma',
      accessToken: encryptAccessToken('old-token'),
    })
    const succeed = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (!String(url).endsWith('/oauth/revoke')) return succeed(url, init)
      const { client_id } = JSON.parse(String(init?.body))
      return client_id === 'read-client'
        ? new Response('{}')
        : new Response(JSON.stringify({ error: 'unauthorized_client' }), { status: 403 })
    })

    await callback({ csrf: 'c', timestamp: Date.now(), callbackUrl: '/' })

    // 今回のアプリから試し、受け付けられたところで止める。同じアプリを2回試さない
    expect(revokeCalls().map(([, init]) => JSON.parse(String(init?.body)).client_id)).toEqual([
      'db-client',
      'read-client',
    ])
  })

  it('初めてのログインや、同じトークンのときは何も失効させない', async () => {
    loginSucceeds()
    prismaMock.user.findUnique.mockResolvedValueOnce(null)
    await callback({ csrf: 'c', timestamp: Date.now(), callbackUrl: '/' })

    prismaMock.user.findUnique.mockResolvedValueOnce({
      platform: 'pleroma',
      accessToken: encryptAccessToken('new-token'),
    })
    await callback({ csrf: 'c', timestamp: Date.now(), callbackUrl: '/' })

    expect(revokeCalls()).toHaveLength(0)
    expect(issueSessionRedirect).toHaveBeenCalledTimes(2)
  })

  it('前のトークンを失効できなくても、ログインは続ける', async () => {
    loginSucceeds()
    prismaMock.user.findUnique.mockResolvedValue({
      platform: 'pleroma',
      accessToken: encryptAccessToken('old-token'),
    })
    const succeed = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (url, init) =>
      String(url).endsWith('/oauth/revoke')
        ? new Response(JSON.stringify({ error: 'unauthorized_client' }), { status: 403 })
        : succeed(url, init)
    )

    const response = await callback({ csrf: 'c', timestamp: Date.now(), callbackUrl: '/' })

    expect(response.headers.get('location')).toBe('https://hosteka.test/')
    expect(issueSessionRedirect).toHaveBeenCalledTimes(1)
  })
})
