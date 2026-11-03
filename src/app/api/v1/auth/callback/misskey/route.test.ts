import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))

/*
  宛先の確認（`remoteFetch` が毎回呼ぶ）は名前を引く。モックしないと
  テストが DNS に依存する。判定そのものは `outbound-host.test.ts` が見ている。
*/
vi.mock('@/server/auth/outbound-host', () => ({ checkOutboundHost: async () => null }))

const issueSessionRedirect = vi.fn()
vi.mock('@/server/auth/oauth-callback', () => ({
  issueSessionRedirect: (...args: unknown[]) => issueSessionRedirect(...args),
}))

vi.mock('@/server/auth/terms', () => ({ recordTermsAcceptance: async () => undefined }))
vi.mock('@/lib/user-tracking', () => ({
  checkBannedUser: async () => false,
  updateUserLoginInfo: async () => undefined,
}))
vi.mock('@/lib/webfinger', () => ({ verifyMisskeyUser: async () => ({ valid: true }) }))

import { COOKIE_OAUTH_SESSION } from '@/lib/cookie-names'
import { encrypt, encryptAccessToken } from '@/lib/crypto'
import { signMiAuthCallback } from '@/server/auth/miauth-callback'
import { prismaMock, resetPrismaMock } from '@/test/contract'

import { GET } from './route'

/**
 * Misskey のコールバック。**MiAuth には state が無い**ので、URL の値は
 * 誰でも書き換えられる。署名した値以外で振る舞いを変えないこと。
 *
 * 署名の外の値で「誰として扱うか」を変えると、自分の MiAuth で認証し、
 * `userId` を他人の ID（公開のイベント詳細に出ている）に書き換えるだけで
 * 他人としてログインできる。
 */
const ORIGINAL_ENV = { ...process.env }
const SERVER = 'misskey.io'
const SESSION = 'miauth-session'

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = 'test-secret-test-secret-test-secret'
  process.env.NEXTAUTH_URL = 'https://hosteka.test'
  resetPrismaMock()
  issueSessionRedirect.mockReset()
  issueSessionRedirect.mockImplementation(async () =>
    NextResponse.redirect('https://hosteka.test/')
  )
  // 認証したのは attacker のアカウント
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            String(url).includes('/check')
              ? { token: 'attacker-token' }
              : { username: 'attacker', name: 'Attacker' }
          ),
          { status: 200 }
        )
    )
  )
  prismaMock.user.upsert.mockImplementation(async ({ create }: { create: object }) => ({
    id: 'attacker-id',
    lastTermsAcceptedAt: new Date(),
    ...create,
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.env = { ...ORIGINAL_ENV }
})

/** register が置く Cookie。**このブラウザで始めたログイン**の印 */
function miauthCookie(overrides: Record<string, unknown> = {}) {
  const session = encrypt({
    platform: 'misskey',
    server: SERVER,
    session: SESSION,
    createdAt: Date.now(),
    ...overrides,
  })
  return `${COOKIE_OAUTH_SESSION}=${session}`
}

function callback(
  extra: Record<string, string> = {},
  signedWrite = false,
  cookie: string | null = miauthCookie()
) {
  const timestamp = Date.now()
  const params = new URLSearchParams({
    server: SERVER,
    session: SESSION,
    ts: String(timestamp),
    write: signedWrite ? '1' : '0',
    sig: signMiAuthCallback({ server: SERVER, session: SESSION, timestamp, write: signedWrite }),
    ...extra,
  })
  return GET(
    new NextRequest(`https://hosteka.test/api/v1/auth/callback/misskey?${params}`, {
      headers: cookie ? { cookie } : {},
    })
  )
}

describe('Misskey のコールバック', () => {
  it('URL の userId を書き換えても、他人のトークンを差し替えず、他人としてログインさせない', async () => {
    await callback({ upgrade: 'true', userId: 'victim-id' })

    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(issueSessionRedirect).toHaveBeenCalledTimes(1)
    expect(issueSessionRedirect.mock.calls[0][0]).toMatchObject({ id: 'attacker-id' })
    // 認証したアカウントで引いている
    expect(prismaMock.user.upsert.mock.calls[0][0].where).toEqual({
      username_server: { username: 'attacker', server: SERVER },
    })
  })

  it('投稿の権限を要求したか（write）は署名済みの値で記録する', async () => {
    await callback({}, true)

    expect(prismaMock.user.upsert.mock.calls[0][0].create.hasWritePermission).toBe(true)
  })

  it('write を署名の外で書き換えると通さない', async () => {
    const response = await callback({ write: '1' }, false)

    expect(response.headers.get('location')).toContain('/auth/error?error=invalid_state')
    expect(prismaMock.user.upsert).not.toHaveBeenCalled()
    expect(issueSessionRedirect).not.toHaveBeenCalled()
  })

  /**
   * 署名は URL の書き換えを防ぐが、URL ごと踏ませることは防げない。
   * 自分のアカウントで承認したコールバック URL を踏ませると、相手を
   * 自分のアカウントでログインさせられる。
   */
  it('このブラウザで始めたログインの Cookie が無ければ進めない', async () => {
    const response = await callback({}, false, null)

    expect(response.headers.get('location')).toContain('/auth/error?error=missing_session')
    expect(fetch).not.toHaveBeenCalled()
    expect(issueSessionRedirect).not.toHaveBeenCalled()
  })

  it('Cookie のセッションが URL のものと違えば進めない', async () => {
    const response = await callback({}, false, miauthCookie({ session: 'other-session' }))

    expect(response.headers.get('location')).toContain('/auth/error?error=invalid_state')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('Mastodon のログインで発行された Cookie では進めない', async () => {
    const response = await callback({}, false, miauthCookie({ platform: 'mastodon' }))

    expect(response.headers.get('location')).toContain('/auth/error?error=missing_session')
  })

  /**
   * MiAuth は承認のたびに新しいトークンを作る。前のトークンを残すと、
   * 利用者の「連携アプリ」に Hosteka がログインの回数だけ並ぶ。
   */
  it('入り直したら、前のトークンをそのトークン自身で失効させる', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      platform: 'misskey',
      accessToken: encryptAccessToken('old-token'),
    })

    await callback()

    const revoke = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url) === `https://${SERVER}/api/i/revoke-token`)
    expect(JSON.parse(String(revoke?.[1]?.body))).toEqual({ i: 'old-token', token: 'old-token' })
    // 新しいトークンを保存してから失効させる。逆だと、保存に失敗したとき使えるトークンが無くなる
    expect(prismaMock.user.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(fetch).mock.invocationCallOrder.at(-1)!
    )
  })

  it('初めてのログインや、同じトークンのときは何も失効させない', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)
    await callback()

    prismaMock.user.findUnique.mockResolvedValueOnce({
      platform: 'misskey',
      accessToken: encryptAccessToken('attacker-token'),
    })
    await callback()

    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).not.toContain(
      `https://${SERVER}/api/i/revoke-token`
    )
  })

  it('前のトークンを失効できなくても、ログインは続ける', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      platform: 'misskey',
      accessToken: encryptAccessToken('old-token'),
    })
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).endsWith('/revoke-token')) throw new Error('ECONNRESET')
      return new Response(
        JSON.stringify(
          String(url).includes('/check') ? { token: 'attacker-token' } : { username: 'attacker' }
        ),
        { status: 200 }
      )
    })

    await callback()

    expect(issueSessionRedirect).toHaveBeenCalledTimes(1)
  })
})
