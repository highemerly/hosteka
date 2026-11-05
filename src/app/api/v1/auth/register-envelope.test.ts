import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeRequest, prismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))

/*
  接続先の確認（`server/auth/outbound-host.ts`）は**名前を引く**。
  モックしないとテストが DNS に依存し、走る場所で結果が変わる。
  ガード自体は `outbound-host.test.ts` が見ている。
*/
const checkOutboundHost = vi.fn(async () => null)
vi.mock('@/server/auth/outbound-host', () => ({
  checkOutboundHost: () => checkOutboundHost(),
}))

import { COOKIE_OAUTH_SESSION } from '@/lib/cookie-names'
import { encrypt } from '@/lib/crypto'

import { POST as discordPost } from './discord/register/route'
import { POST as mastodonPost } from './mastodon/register/route'
import { POST as misskeyPost } from './misskey/register/route'
import { POST as pleromaPost } from './pleroma/register/route'
import { POST as twitterPost } from './twitter/register/route'

/**
 * OAuth を始める5本のルートが、**同じ形で認証URLを返す**こと。
 *
 * クライアントは `api.post` で叩き、統一エンベロープの `data` を剥がして
 * 受け取る。ところが Misskey・Discord・X の3本は `NextResponse.json` を
 * 素で返していたため、剥がした先が `undefined` になっていた
 * （`location.href = undefined` で `/undefined` へ飛ぶ）。
 *
 * **画面側のテストでは捕まらない。** 型は `Promise<{authUrl: string}>` を
 * 名乗っており、壊れるのは実行時だけ。ここで応答の形そのものを見る。
 */
const ROUTES = {
  mastodon: mastodonPost,
  misskey: misskeyPost,
  pleroma: pleromaPost,
  twitter: twitterPost,
  discord: discordPost,
}

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  checkOutboundHost.mockReset()
  checkOutboundHost.mockResolvedValue(null)
  process.env.NEXTAUTH_SECRET = 'test-secret-test-secret-test-secret'
  process.env.NEXTAUTH_URL = 'https://hosteka.test'
  process.env.DISCORD_CLIENT_ID = 'discord-client'
  process.env.TWITTER_CLIENT_ID = 'twitter-client'

  // Mastodon / Pleroma は登録済みのアプリを使い回す（`server/auth/oauth-app.ts`）
  prismaMock.oauthApp.findUnique.mockResolvedValue({
    id: 'app_1',
    clientId: 'cid',
    clientSecret: encrypt({ secret: 'secret' }),
  })

  // 相手のサーバーは叩かない。生存確認とアプリ登録だけ通す
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ client_id: 'cid', client_secret: 'secret' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    )
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.env = { ...ORIGINAL_ENV }
})

async function post(
  platform: keyof typeof ROUTES,
  body: Record<string, unknown>
) {
  const response = await ROUTES[platform](
    makeRequest(`/api/v1/auth/${platform}/register`, { method: 'POST', body })
  )
  return { status: response.status, body: await response.json() }
}

describe('OAuth を始めるルートの応答', () => {
  const cases: { platform: keyof typeof ROUTES; body: Record<string, unknown> }[] = [
    {
      platform: 'mastodon',
      body: { server: 'mastodon.social', callbackUrl: '/', termsAccepted: true },
    },
    { platform: 'misskey', body: { server: 'misskey.io', callbackUrl: '/', termsAccepted: true } },
    {
      platform: 'pleroma',
      body: { server: 'pleroma.social', callbackUrl: '/', termsAccepted: true },
    },
    { platform: 'twitter', body: { callbackUrl: '/', termsAccepted: true } },
    { platform: 'discord', body: { callbackUrl: '/', termsAccepted: true } },
  ]

  for (const { platform, body } of cases) {
    it(`${platform} はエンベロープに載せて認証URLを返す`, async () => {
      const result = await post(platform, body)

      expect(result.status).toBe(200)
      // ここが本題。`data` の中に入っていること
      expect(typeof result.body.data?.authUrl).toBe('string')
      expect(result.body.data.authUrl.startsWith('https://')).toBe(true)
    })
  }

  /**
   * **同意を確かめる場所はここだけ。** `/auth/consent` を廃したので、
   * コールバックは「戻ってきた時点で同意は済んでいる」を前提に記録する。
   * 5本のうち1本でも検査を忘れると、そこからだけ**同意していない人の
   * 同意記録**ができる。画面は正常に見える。
   */
  for (const { platform, body } of cases) {
    it(`${platform} は同意なしのログインを始めない`, async () => {
      const { termsAccepted: _omitted, ...withoutConsent } = body
      const result = await post(platform, withoutConsent)

      expect(result.status).toBe(400)
      expect(result.body.error?.code).toBe('VALIDATION_ERROR')
    })
  }
})

/**
 * MiAuth のコールバック URL には、**署名した値だけを載せる。**
 * 署名の外の値をコールバックが信じると、書き換えるだけで他人として
 * セッションを出せる。
 */
describe('Misskey のコールバック URL', () => {
  it('ログイン中のユーザーの ID を載せず、投稿の権限の要求は署名の対象に入れる', async () => {
    const result = await post('misskey', {
      server: 'misskey.io',
      callbackUrl: '/',
      termsAccepted: true,
      requestWritePermission: true,
    })

    const authUrl = new URL(result.body.data.authUrl)
    const callback = new URL(authUrl.searchParams.get('callback')!)
    expect(callback.searchParams.has('userId')).toBe(false)
    expect(callback.searchParams.has('upgrade')).toBe(false)
    expect(callback.searchParams.get('write')).toBe('1')
    expect(authUrl.searchParams.get('permission')).toBe('read:account,write:notes')
  })
})

/**
 * コールバックで「このブラウザで始めたログインか」を確かめるための Cookie。
 * 無いと、承認済みのコールバック URL を踏ませて他人を自分のアカウントで
 * ログインさせられる。
 */
describe('ログインを始めたブラウザの印', () => {
  for (const platform of ['mastodon', 'misskey', 'pleroma'] as const) {
    it(`${platform} は ht-oauth Cookie を置く`, async () => {
      const response = await ROUTES[platform](
        makeRequest(`/api/v1/auth/${platform}/register`, {
          method: 'POST',
          body: { server: `${platform}.example`, callbackUrl: '/', termsAccepted: true },
        })
      )

      expect(response.headers.get('set-cookie')).toMatch(new RegExp(`^${COOKIE_OAUTH_SESSION}=[^;]+;`))
    })
  }
})

/**
 * **Mastodon のアプリは、求める権限と同じ権限で登録する。** Mastodon の
 * 「認証済みアプリ」はアプリに登録した権限を表示するので、全部の権限で
 * 登録すると、読み取りだけで入った人にも「書き込み」と表示される。
 */
describe('Mastodon のアプリの権限', () => {
  const lookedUpScopes = () =>
    prismaMock.oauthApp.findUnique.mock.calls.at(-1)?.[0].where.platform_server_redirectUri_scopes.scopes

  it('読み取りだけのログインでは、読み取りだけのアプリを使う', async () => {
    const result = await post('mastodon', { server: 'mastodon.social', callbackUrl: '/', termsAccepted: true })

    expect(lookedUpScopes()).toBe('read:accounts')
    expect(new URL(result.body.data.authUrl).searchParams.get('scope')).toBe('read:accounts')
  })

  it('投稿の権限を求めるログインでは、投稿の権限つきのアプリを使う', async () => {
    const result = await post('mastodon', {
      server: 'mastodon.social',
      callbackUrl: '/',
      termsAccepted: true,
      requestWritePermission: true,
    })

    expect(lookedUpScopes()).toBe('read:accounts read:statuses write:statuses')
    expect(new URL(result.body.data.authUrl).searchParams.get('scope')).toBe(
      'read:accounts read:statuses write:statuses'
    )
  })
})

/**
 * **接続先の確認を通ってからでないと、相手のサーバーを叩かない。**
 *
 * この3本は未認証で叩けて、本文のホスト名へこちらから接続する。
 * 名前で内部に届く経路を閉じないと、クラスタの中だけに見えるものを
 * 外から叩かせられる（`server/auth/outbound-host.ts`）。
 */
describe('接続先の確認', () => {
  const WITH_SERVER = ['mastodon', 'misskey', 'pleroma'] as const

  it.each(WITH_SERVER)('%s は内部アドレスに解決される名前を断る', async (platform) => {
    checkOutboundHost.mockResolvedValue('private-address' as never)

    const result = await post(platform, {
      server: '10-42-0-7.nip.io',
      callbackUrl: '/',
      termsAccepted: true,
    })

    expect(result.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it.each(WITH_SERVER)('%s は内部向けの名前を断る', async (platform) => {
    checkOutboundHost.mockResolvedValue('blocked-name' as never)

    const result = await post(platform, {
      server: 'redis.default.svc.cluster.local',
      callbackUrl: '/',
      termsAccepted: true,
    })

    expect(result.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
