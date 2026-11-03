import 'server-only'

import { checkOutboundHost } from '@/server/auth/outbound-host'

/**
 * **利用者が決めたサーバーへの通信は、すべてここを通す。**
 *
 * Mastodon / Misskey / Pleroma のサーバーは利用者が入力したもので、
 * 誰でも偽のサーバーを立ててログインできる。素の `fetch` で繋ぐと:
 *
 * - **リダイレクトを追う。** 307 は POST と本文を保ったまま、`http://10.x.x.x`
 *   のようなクラスタの内部へ飛ぶ。応答の本文を利用者へ返す経路があれば、
 *   内部の応答をそのまま読み出せる
 * - **時間も大きさも無制限。** 数GBの本文や、少しずつ流し続ける応答で、
 *   メモリと接続を詰まらせられる
 *
 * なので、ここでは毎回:
 *
 * 1. 宛先の名前を引いて、内部のアドレスなら繋がない（`checkOutboundHost`）
 * 2. リダイレクトは追わず、失敗として扱う
 * 3. タイムアウトを必ず付ける（本文を読み切るまでを含む）
 * 4. 本文は `MAX_BODY_BYTES` までしか読まない
 *
 * 名前を引いてから繋ぐまでの隙（DNS リバインディング）は残るが、宛先は常に
 * `https://<ホスト名>` なので、内部のアドレスへ向け直されても証明書の検証で落ちる。
 *
 * discord.com や anypost.dev のように**宛先が固定のもの**はここを通さない。
 */

export const MAX_BODY_BYTES = 1024 * 1024
const DEFAULT_TIMEOUT_MS = 10_000

export type RemoteFetchFailure =
  | 'blocked-name'
  | 'private-address'
  | 'unresolvable'
  | 'redirect'
  | 'too-large'

export class RemoteFetchError extends Error {
  constructor(readonly reason: RemoteFetchFailure) {
    super(`remote fetch refused: ${reason}`)
    this.name = 'RemoteFetchError'
  }
}

/** 宛先が内部だったか（利用者に「接続できない」と言うべきか） */
export function isBlockedDestination(error: unknown): boolean {
  return (
    error instanceof RemoteFetchError &&
    (error.reason === 'blocked-name' || error.reason === 'private-address')
  )
}

/** 本文を持てないステータス。`new Response` に本文を渡すと例外になる */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304])

async function readCapped(response: Response): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!response.body) return null

  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    await response.body.cancel()
    throw new RemoteFetchError('too-large')
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new RemoteFetchError('too-large')
    }
    chunks.push(value)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

/**
 * 返すのは**本文を読み切った** `Response`。呼ぶ側は `ok` / `json()` / `text()` を
 * いつもどおり使える。断ったときは `RemoteFetchError`、繋がらない・時間切れは
 * `fetch` の例外がそのまま投げられる。
 */
export async function remoteFetch(
  url: string,
  init: Omit<RequestInit, 'redirect' | 'signal'> & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init

  const blocked = await checkOutboundHost(new URL(url).hostname)
  if (blocked) throw new RemoteFetchError(blocked)

  const response = await fetch(url, {
    ...rest,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel()
    throw new RemoteFetchError('redirect')
  }

  const body = await readCapped(response)
  return new Response(NULL_BODY_STATUSES.has(response.status) ? null : body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}
