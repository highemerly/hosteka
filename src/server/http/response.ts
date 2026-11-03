import 'server-only'

import { NextResponse } from 'next/server'

import { isDatabaseConnectionError } from './db-errors'

import { ApiError, isApiError, type FieldIssue } from './errors'

/**
 * レスポンスのエンベロープ。
 *
 * 現状は「素のオブジェクト」「素の配列」「{report: ...}」「{events, totalCount, page}」
 * 「{items, pagination: {...}}」が混在しており、クライアントが形を推測できない。
 * すべて data / meta / error に寄せる。
 */

export type Meta = {
  total: number
  page: number
  perPage: number
  totalPages: number
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init)
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json({ data }, { status: 201 })
}

export function okList<T>(data: T[], meta: Meta): NextResponse {
  return NextResponse.json({ data, meta })
}

export function makeMeta(total: number, page: number, perPage: number): Meta {
  return {
    total,
    page,
    perPage,
    totalPages: perPage > 0 ? Math.ceil(total / perPage) : 0,
  }
}

export function errorResponse(
  error: ApiError,
  requestId: string
): NextResponse {
  const body: {
    error: { code: string; message: string; requestId: string; details?: FieldIssue[] }
  } = {
    error: {
      code: error.code,
      message: error.message,
      requestId,
    },
  }
  if (error.details?.length) body.error.details = error.details

  /*
    **エラーは絶対にキャッシュさせない。** `next.config.ts` が `/api/*` に
    `private, no-store` を被せているが、公開キャッシュを許した例外パス
    （`PUBLICLY_CACHEABLE_API`）はその網から外れる。そこで 500 を返したときに
    何のヘッダも付いていないと、**CDN が独自の判断で持ちうる**。
    成功した応答のヘッダは `defineRoute` が決める。
  */
  return NextResponse.json(body, {
    status: error.status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

/**
 * 想定外の例外を ApiError に変換する。
 *
 * db-errors.ts の isDatabaseConnectionError をここで初めて実際に使う
 * （これまで定義されているだけで、サーバー側から一度も呼ばれていなかった）。
 * DB接続断は 500 ではなく 503 で返す。クライアントに「再試行する価値がある」
 * ことが伝わるため。
 */
export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) return error
  if (isDatabaseConnectionError(error)) {
    return ApiError.serviceUnavailable()
  }
  return ApiError.internal()
}
