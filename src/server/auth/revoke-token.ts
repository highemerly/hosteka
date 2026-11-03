import 'server-only'
import { remoteFetch } from '@/server/remote-fetch'

/**
 * ログインし直して使わなくなった前のアクセストークンを、相手のサーバーで失効させる。
 * **新しいトークンを保存してから呼ぶ。** 逆だと、保存に失敗したとき使えるトークンが無くなる。
 *
 * **失敗してもログインは止めない。** 失効は後片付けで、できなくても
 * 相手のサーバーに使われないトークンが残るだけ。待ちすぎないよう短く切る。
 */

const USER_AGENT = 'Hosteka/1.0'

/**
 * Misskey。`i/revoke-token` にそのトークン自身で頼む。
 *
 * アプリが自分のトークンを失効させられるのは **Misskey 2026.9.0 から**。
 * それより前のサーバーや、対応していない派生版では断られるが、そのままにする。
 */
export async function revokeMisskeyToken(server: string, token: string): Promise<void> {
  try {
    const response = await remoteFetch(`https://${server}/api/i/revoke-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ i: token, token }),
      timeoutMs: 5000,
    })
    if (!response.ok) {
      console.info(`[OAuth] 前のトークンを失効できなかった: server=${server} status=${response.status}`)
    }
  } catch {
    // つながらない等。残るだけなので諦める
  }
}

/**
 * Mastodon / Pleroma。`/oauth/revoke` にアプリの認証情報を添えて頼む。
 *
 * **そのトークンを発行したアプリでしか失効できない**（Doorkeeper は
 * 別のアプリからの依頼を 403 で断る）。アプリは求める権限の組ごとに
 * 分かれているので、どれが発行したかは分からない。**受け付けられるまで順に試す。**
 *
 * アプリを使い回す前、ログインごとに別のアプリを登録していた頃のトークンは、
 * その認証情報をもう持っていないので失効できない。断られてもそのままにする。
 */
export async function revokeOAuthToken(
  server: string,
  apps: readonly { clientId: string; clientSecret: string }[],
  token: string
): Promise<void> {
  for (const app of apps) {
    try {
      const response = await remoteFetch(`https://${server}/oauth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
        body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, token }),
        timeoutMs: 5000,
      })
      if (response.ok) return
    } catch {
      // つながらない等。次のアプリで試しても同じなので諦める
      return
    }
  }
  console.info(`[OAuth] 前のトークンを失効できなかった: server=${server}`)
}
