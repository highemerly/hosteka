import 'server-only'

import { getBaseUrl } from '@/lib/base-url'

import { ApiError } from './errors'
import { errorResponse } from './response'

/** 読むだけの要求。ここに入るものは何も変えない前提で、確かめない */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * 別のサイトのページから送られてきた変更か（CSRF の対策）。
 *
 * **Origin を公開URL（`NEXTAUTH_URL`）と突き合わせる。** Host ヘッダは
 * クライアントが書き換えられるので使わない（`lib/base-url.ts`）。
 *
 * - Cookie の `SameSite=Lax` で、別サイトのフォームの POST にはセッションが
 *   載らない。ただし Cookie を読まずに Cookie を消すログアウトのように、
 *   **セッションが要らない変更**はそれでは止まらない
 * - **Origin の無い要求は通す。** 今のブラウザは GET 以外の要求（フォームの
 *   送信も fetch も）に必ず Origin を付ける。付いていないのはブラウザ以外
 *   （curl・cron）で、別サイトのページから踏ませる経路にならない
 * - `Origin: null`（サンドボックスの iframe など）は、一致しないので断る
 */
export function isCrossOriginWrite(request: Request): boolean {
  if (SAFE_METHODS.has(request.method)) return false
  const origin = request.headers.get('origin')
  if (origin === null) return false
  return origin !== new URL(getBaseUrl()).origin
}

export function crossOriginError(): ApiError {
  return ApiError.forbidden('別のサイトからの操作は受け付けていません')
}

/**
 * `defineRoute` の外のルート（ログアウトなど）が、先頭で呼ぶ。
 * 断るときは統一エンベロープの 403 を返す。通すときは null
 */
export function rejectCrossOrigin(request: Request): Response | null {
  if (!isCrossOriginWrite(request)) return null
  return errorResponse(crossOriginError(), crypto.randomUUID())
}
