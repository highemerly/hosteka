import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))

/*
  宛先の確認（`remoteFetch` が毎回呼ぶ）は名前を引く。モックしないと
  テストが DNS に依存する。判定そのものは `outbound-host.test.ts` が見ている。
*/
vi.mock('@/server/auth/outbound-host', () => ({ checkOutboundHost: async () => null }))

import { decrypt, encrypt } from '@/lib/crypto'
import { prismaMock, resetPrismaMock } from '@/test/contract'

import { findOauthApp, findOauthAppsForServer, getOrRegisterOauthApp } from './oauth-app'

/**
 * Mastodon / Pleroma の OAuth アプリの使い回し。
 *
 * 以前はログインのたびに `POST /api/v1/apps` をしていて、利用者の
 * 「認証済みアプリ」に Hosteka がログインの回数だけ並んでいた。
 */
const ORIGINAL_ENV = { ...process.env }

const INPUT = {
  platform: 'mastodon' as const,
  server: 'Handon.Club',
  baseUrl: 'https://hosteka.test',
  scopes: 'read:accounts read:statuses write:statuses',
}

const KEY = {
  platform: 'mastodon',
  server: 'handon.club',
  redirectUri: 'https://hosteka.test/api/v1/auth/callback/mastodon',
  scopes: INPUT.scopes,
}

function saved(overrides: Record<string, unknown> = {}) {
  return {
    id: 'app_1',
    ...KEY,
    clientId: 'saved-client',
    clientSecret: encrypt({ secret: 'saved-secret' }),
    ...overrides,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** 叩かれた URL の一覧 */
function calledUrls(): string[] {
  return vi.mocked(fetch).mock.calls.map(([url]) => String(url))
}

beforeEach(() => {
  resetPrismaMock()
  process.env.NEXTAUTH_SECRET = 'test-secret-test-secret-test-secret'
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.env = { ...ORIGINAL_ENV }
})

describe('ログインに使うアプリ', () => {
  it('保存してあるアプリが有効なら、登録し直さずに使う', async () => {
    prismaMock.oauthApp.findUnique.mockResolvedValue(saved())
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).endsWith('/oauth/token') ? json({ access_token: 'app-token' }) : json({})
    )

    const app = await getOrRegisterOauthApp(INPUT)

    expect(app).toEqual({ id: 'app_1', clientId: 'saved-client', clientSecret: 'saved-secret' })
    expect(calledUrls()).not.toContain('https://handon.club/api/v1/apps')
    expect(prismaMock.oauthApp.findUnique).toHaveBeenCalledWith({
      where: { platform_server_redirectUri_scopes: KEY },
    })
  })

  it('確かめるために取ったアプリのトークンは、取り消して残さない', async () => {
    prismaMock.oauthApp.findUnique.mockResolvedValue(saved())
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).endsWith('/oauth/token') ? json({ access_token: 'app-token' }) : json({})
    )

    await getOrRegisterOauthApp(INPUT)

    const revoke = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/oauth/revoke'))
    expect(JSON.parse(String(revoke?.[1]?.body))).toMatchObject({ token: 'app-token' })
  })

  it('保存が無ければ登録し、シークレットは暗号化して保存する', async () => {
    prismaMock.oauthApp.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(saved({ clientId: 'new-client', clientSecret: encrypt({ secret: 'new-secret' }) }))
    vi.mocked(fetch).mockResolvedValue(json({ client_id: 'new-client', client_secret: 'new-secret' }))

    const app = await getOrRegisterOauthApp(INPUT)

    expect(app.clientId).toBe('new-client')
    expect(calledUrls()).toEqual(['https://handon.club/api/v1/apps'])
    const [{ data, skipDuplicates }] = prismaMock.oauthApp.createMany.mock.calls[0]
    expect(skipDuplicates).toBe(true)
    expect(data[0]).toMatchObject({ ...KEY, clientId: 'new-client' })
    expect(data[0].clientSecret).not.toContain('new-secret')
    expect(decrypt<{ secret: string }>(data[0].clientSecret)?.secret).toBe('new-secret')
  })

  it('登録する権限とコールバック先は、渡したとおりに送る', async () => {
    prismaMock.oauthApp.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(saved())
    vi.mocked(fetch).mockResolvedValue(json({ client_id: 'c', client_secret: 's' }))

    await getOrRegisterOauthApp(INPUT)

    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({
      client_name: 'Hosteka',
      redirect_uris: KEY.redirectUri,
      scopes: INPUT.scopes,
    })
  })

  /**
   * **同時に初めてのログインが来ても、行を1つにする。** 負けた側も、
   * 勝った側のアプリで認可画面を出す。自分が登録したほうを返すと、
   * コールバックで DB のアプリと食い違ってトークンを交換できない。
   */
  it('同時に登録されて保存で負けたら、先に保存されたアプリを使う', async () => {
    prismaMock.oauthApp.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(saved({ id: 'winner', clientId: 'winner-client' }))
    vi.mocked(fetch).mockResolvedValue(json({ client_id: 'loser-client', client_secret: 'x' }))

    const app = await getOrRegisterOauthApp(INPUT)

    expect(app).toMatchObject({ id: 'winner', clientId: 'winner-client', clientSecret: 'saved-secret' })
  })

  /**
   * アプリは相手のサーバーで消えることがある。消えたアプリで認可画面へ
   * 送ると、相手のエラー画面で止まって戻ってこない。
   */
  it('相手のサーバーでアプリが消えていたら、同じ行を登録し直した値で置き換える', async () => {
    prismaMock.oauthApp.findUnique.mockResolvedValue(saved())
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).endsWith('/oauth/token')
        ? json({ error: 'invalid_client' }, 401)
        : json({ client_id: 'fresh-client', client_secret: 'fresh-secret' })
    )

    const app = await getOrRegisterOauthApp(INPUT)

    expect(app).toEqual({ id: 'app_1', clientId: 'fresh-client', clientSecret: 'fresh-secret' })
    const [{ where, data }] = prismaMock.oauthApp.update.mock.calls[0]
    expect(where).toEqual({ id: 'app_1' })
    expect(data.clientId).toBe('fresh-client')
    expect(decrypt<{ secret: string }>(data.clientSecret)?.secret).toBe('fresh-secret')
  })

  it('有効か確かめられないときは、登録し直さずに使い続ける', async () => {
    prismaMock.oauthApp.findUnique.mockResolvedValue(saved())
    vi.mocked(fetch).mockResolvedValueOnce(json({ error: 'unsupported_grant_type' }, 400))

    const app = await getOrRegisterOauthApp(INPUT)
    expect(app.clientId).toBe('saved-client')

    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNRESET'))
    expect((await getOrRegisterOauthApp(INPUT)).clientId).toBe('saved-client')

    expect(calledUrls()).not.toContain('https://handon.club/api/v1/apps')
    expect(prismaMock.oauthApp.update).not.toHaveBeenCalled()
  })

  it('サーバーの回数制限で登録できなければ、そう伝える', async () => {
    prismaMock.oauthApp.findUnique.mockResolvedValue(null)
    vi.mocked(fetch).mockResolvedValue(new Response('Too many requests', { status: 429 }))

    await expect(getOrRegisterOauthApp(INPUT)).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    expect(prismaMock.oauthApp.createMany).not.toHaveBeenCalled()
  })
})

describe('コールバックでのアプリの引き当て', () => {
  it('プラットフォームとサーバーが Cookie と一致すれば、復号して返す', async () => {
    prismaMock.oauthApp.findUnique.mockResolvedValue(saved())

    expect(await findOauthApp({ id: 'app_1', platform: 'mastodon', server: 'HANDON.club' })).toEqual({
      id: 'app_1',
      clientId: 'saved-client',
      clientSecret: 'saved-secret',
    })
  })

  it('別のプラットフォームやサーバーのアプリは返さない', async () => {
    prismaMock.oauthApp.findUnique.mockResolvedValue(saved())

    expect(await findOauthApp({ id: 'app_1', platform: 'pleroma', server: 'handon.club' })).toBeNull()
    expect(await findOauthApp({ id: 'app_1', platform: 'mastodon', server: 'evil.example' })).toBeNull()
  })

  it('無いアプリは返さない', async () => {
    prismaMock.oauthApp.findUnique.mockResolvedValue(null)
    expect(await findOauthApp({ id: 'gone', platform: 'mastodon', server: 'handon.club' })).toBeNull()
  })
})

describe('失効に使う、同じサーバーのアプリ', () => {
  it('プラットフォーム・サーバー・コールバック先で引き、復号して返す', async () => {
    prismaMock.oauthApp.findMany.mockResolvedValue([
      saved(),
      saved({ id: 'app_2', clientId: 'write-client', clientSecret: encrypt({ secret: 'write-secret' }) }),
    ])

    const apps = await findOauthAppsForServer({
      platform: 'mastodon',
      server: 'Handon.Club',
      baseUrl: 'https://hosteka.test',
    })

    expect(prismaMock.oauthApp.findMany).toHaveBeenCalledWith({
      where: { platform: 'mastodon', server: 'handon.club', redirectUri: KEY.redirectUri },
    })
    expect(apps.map((a) => a.clientSecret)).toEqual(['saved-secret', 'write-secret'])
  })

  it('復号できない行は外す', async () => {
    prismaMock.oauthApp.findMany.mockResolvedValue([saved({ clientSecret: 'broken' })])

    expect(
      await findOauthAppsForServer({ platform: 'mastodon', server: 'handon.club', baseUrl: 'https://hosteka.test' })
    ).toEqual([])
  })
})
