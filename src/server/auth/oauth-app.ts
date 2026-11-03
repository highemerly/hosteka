import 'server-only'

import { decrypt, encrypt } from '@/lib/crypto'
import { normalizeServer } from '@/lib/normalize'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/server/http/errors'
import { remoteFetch } from '@/server/remote-fetch'

/**
 * Mastodon API 互換のサーバー（Mastodon / Pleroma）に登録する OAuth アプリ。
 *
 * **ログインのたびに登録しない。** 以前は毎回 `POST /api/v1/apps` をしていて、
 * 利用者の「認証済みアプリ」に Hosteka がログインの回数だけ並び、古いトークンも
 * 残り続けた。登録の API は回数制限も厳しい。サーバー・コールバック先・権限の
 * 組ごとに1つ登録し、DB に置いて使い回す。
 *
 * **登録する権限は、そのログインで求める権限と同じにする。** 読み取りだけの
 * ログインと、投稿の権限まで求めるログインでは、別のアプリになる。
 * Mastodon の「認証済みアプリ」は**トークンではなくアプリに登録した権限を表示する**
 * ので、頼みうる全部で1つ登録すると、読み取りだけで入った人にも
 * 「書き込み」と表示される（実際にそうなった）。
 */

export type OauthAppPlatform = 'mastodon' | 'pleroma'

export type OauthAppCredentials = {
  id: string
  clientId: string
  clientSecret: string
}

const USER_AGENT = 'Hosteka/1.0'

export function oauthRedirectUri(baseUrl: string, platform: OauthAppPlatform): string {
  return `${baseUrl}/api/v1/auth/callback/${platform}`
}

function sealSecret(secret: string): string {
  return encrypt({ secret })
}

function openSecret(sealed: string): string | null {
  return decrypt<{ secret: string }>(sealed)?.secret ?? null
}

async function registerApp(input: {
  platform: OauthAppPlatform
  server: string
  baseUrl: string
  scopes: string
}): Promise<{ clientId: string; clientSecret: string }> {
  const response = await remoteFetch(`https://${input.server}/api/v1/apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({
      client_name: 'Hosteka',
      redirect_uris: oauthRedirectUri(input.baseUrl, input.platform),
      scopes: input.scopes,
      website: input.baseUrl,
    }),
    timeoutMs: 15000,
  }).catch((error: unknown) => {
    console.error(`[OAuth] アプリの登録に失敗: platform=${input.platform} server=${input.server}`, error)
    throw ApiError.serviceUnavailable(
      'アプリケーションの登録に失敗しました。サーバーが応答しないか、一時的に利用できない可能性があります。'
    )
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[OAuth] アプリの登録に失敗: platform=${input.platform} server=${input.server}`, errorText)
    if (response.status === 429 || errorText.includes('制限')) {
      throw ApiError.rateLimited(
        'サーバーのレート制限に達しました。しばらく時間をおいてから再度お試しください。'
      )
    }
    throw ApiError.serviceUnavailable(
      'アプリケーションの登録に失敗しました。サーバーが応答しないか、一時的に利用できない可能性があります。'
    )
  }

  const data = (await response.json()) as { client_id?: unknown; client_secret?: unknown }
  if (typeof data.client_id !== 'string' || typeof data.client_secret !== 'string') {
    throw ApiError.serviceUnavailable('アプリケーションの登録に失敗しました。')
  }
  return { clientId: data.client_id, clientSecret: data.client_secret }
}

/**
 * 保存してあるアプリが、相手のサーバーでまだ有効か。
 *
 * **アプリはサーバー側で消えることがある**（管理者の削除や、使われていない
 * アプリの掃除）。消えたアプリで認可画面へ送ると、相手のサーバーのエラー画面で
 * 止まり、Hosteka に戻ってこない。なので送る前に確かめる。
 *
 * アプリ自身のトークン（client_credentials）を取ってみて、**認証に失敗した
 * ときだけ** `invalid` とする。つながらない・この方式に対応していない等は
 * `unknown` として使い続ける — 確かめられないことを理由にログインを止めない。
 */
async function verifyApp(
  server: string,
  app: { clientId: string; clientSecret: string; scopes: string }
): Promise<'valid' | 'invalid' | 'unknown'> {
  try {
    const response = await remoteFetch(`https://${server}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: app.clientId,
        client_secret: app.clientSecret,
        // 省略すると read を頼むことになり、read を持たないアプリでは
        // 「権限が無い」で断られて、有効かどうかが分からない
        scope: app.scopes,
      }),
    })

    if (response.ok) {
      const data = (await response.json().catch(() => null)) as { access_token?: unknown } | null
      // 確かめるためだけのトークン。相手のサーバーに溜めない
      if (typeof data?.access_token === 'string') {
        await remoteFetch(`https://${server}/oauth/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
          body: JSON.stringify({
            client_id: app.clientId,
            client_secret: app.clientSecret,
            token: data.access_token,
          }),
          timeoutMs: 5000,
        }).catch(() => {})
      }
      return 'valid'
    }

    if (response.status === 401) return 'invalid'
    const data = (await response.json().catch(() => null)) as { error?: unknown } | null
    return data?.error === 'invalid_client' ? 'invalid' : 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * ログインに使うアプリを返す。無ければ登録し、相手のサーバーで消えていれば登録し直す。
 */
export async function getOrRegisterOauthApp(input: {
  platform: OauthAppPlatform
  server: string
  baseUrl: string
  /** 登録する権限。ログインのときに求める権限と同じにする */
  scopes: string
}): Promise<OauthAppCredentials> {
  const key = {
    platform: input.platform,
    server: normalizeServer(input.server),
    redirectUri: oauthRedirectUri(input.baseUrl, input.platform),
    scopes: input.scopes,
  }

  const existing = await prisma.oauthApp.findUnique({
    where: { platform_server_redirectUri_scopes: key },
  })

  if (existing) {
    const clientSecret = openSecret(existing.clientSecret)
    if (clientSecret) {
      const status = await verifyApp(key.server, {
        clientId: existing.clientId,
        clientSecret,
        scopes: key.scopes,
      })
      if (status !== 'invalid') {
        return { id: existing.id, clientId: existing.clientId, clientSecret }
      }
    }
    // 消えていた（または鍵が変わって復号できない）。同じ行を登録し直した値で置き換える
    const registered = await registerApp({ ...input, server: key.server })
    await prisma.oauthApp.update({
      where: { id: existing.id },
      data: { clientId: registered.clientId, clientSecret: sealSecret(registered.clientSecret) },
    })
    return { id: existing.id, ...registered }
  }

  const registered = await registerApp({ ...input, server: key.server })
  /*
    **同時に初めてのログインが来ても、行を1つにする。** 重複は黙って捨て、
    残った行を読み直して使う。負けた側が登録したアプリは使われないまま残るが、
    その人の認可画面も勝った側のアプリで出すので、ログインは成立する。
  */
  await prisma.oauthApp.createMany({
    data: [{ ...key, clientId: registered.clientId, clientSecret: sealSecret(registered.clientSecret) }],
    skipDuplicates: true,
  })
  const saved = await prisma.oauthApp.findUnique({
    where: { platform_server_redirectUri_scopes: key },
  })
  const savedSecret = saved ? openSecret(saved.clientSecret) : null
  if (!saved || !savedSecret) {
    throw ApiError.internal('アプリケーションの登録に失敗しました。')
  }
  return { id: saved.id, clientId: saved.clientId, clientSecret: savedSecret }
}

/**
 * コールバックで、register が使ったアプリを引く。
 *
 * **Cookie の ID だけを信じない。** 行のプラットフォームとサーバーが
 * Cookie のものと一致するときだけ返す。
 */
export async function findOauthApp(input: {
  id: string
  platform: OauthAppPlatform
  server: string
}): Promise<OauthAppCredentials | null> {
  const app = await prisma.oauthApp.findUnique({ where: { id: input.id } })
  if (!app) return null
  if (app.platform !== input.platform || app.server !== normalizeServer(input.server)) return null
  const clientSecret = openSecret(app.clientSecret)
  if (!clientSecret) return null
  return { id: app.id, clientId: app.clientId, clientSecret }
}

/**
 * そのサーバーに登録してあるアプリの全部（権限の組ごとに1つずつある）。
 *
 * 前のトークンの失効に使う。**トークンは発行したアプリでしか失効できない**ので、
 * 読み取りだけから投稿の権限つきへ入り直したときなどは、今回のアプリでは
 * 前のトークンを失効できない。
 */
export async function findOauthAppsForServer(input: {
  platform: OauthAppPlatform
  server: string
  baseUrl: string
}): Promise<OauthAppCredentials[]> {
  const apps = await prisma.oauthApp.findMany({
    where: {
      platform: input.platform,
      server: normalizeServer(input.server),
      redirectUri: oauthRedirectUri(input.baseUrl, input.platform),
    },
  })
  return apps.flatMap((app) => {
    const clientSecret = openSecret(app.clientSecret)
    return clientSecret ? [{ id: app.id, clientId: app.clientId, clientSecret }] : []
  })
}
