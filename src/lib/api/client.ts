import { COOKIE_SECURE, COOKIE_VIEWER } from '@/lib/cookie-names'

/**
 * /api/v1 を叩くクライアント。
 *
 * サーバー側の統一エンベロープ（{ data } / { data, meta } / { error }）を
 * ここで剥がし、呼び出し側は中身だけを扱えるようにする。
 * 生成クライアントは使わない。生成物は劣化しやすいが、この程度の薄さなら
 * 手書きのほうが読めるし壊れない（型だけは OpenAPI から生成する）。
 */

export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL'

export type FieldIssue = { path: string; message: string }

export class ApiClientError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly details?: FieldIssue[]
  readonly requestId?: string

  constructor(init: {
    code: ApiErrorCode
    message: string
    status: number
    details?: FieldIssue[]
    requestId?: string
  }) {
    super(init.message)
    this.name = 'ApiClientError'
    this.code = init.code
    this.status = init.status
    this.details = init.details
    this.requestId = init.requestId
  }

  /** フィールド名 -> メッセージ。フォームのエラー表示に使う */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const d of this.details ?? []) out[d.path] = d.message
    return out
  }
}

export type ListResult<T> = {
  items: T[]
  meta: { total: number; page: number; perPage: number; totalPages: number }
}

function clearViewerCookie(): void {
  if (typeof document === 'undefined') return
  // Secure が無いと、本番の `__Host-` 付きの名前では消えない（cookie-names.ts）
  document.cookie = `${COOKIE_VIEWER}=; Path=/; Max-Age=0; SameSite=Lax${COOKIE_SECURE ? '; Secure' : ''}`
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  // 204 等、本文が無い応答
  if (response.status === 204) return undefined

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = undefined
  }

  if (!response.ok) {
    const err = (payload as { error?: Record<string, unknown> } | undefined)?.error

    // セッションが失効・期限切れになった場合の唯一の復帰経路。
    // 表示用の viewer cookie も捨てないと、ログイン済みのUIのまま
    // 何も操作できない状態になる。
    if (response.status === 401) clearViewerCookie()

    throw new ApiClientError({
      code: (err?.code as ApiErrorCode) ?? 'INTERNAL',
      message: (err?.message as string) ?? '通信に失敗しました',
      status: response.status,
      details: err?.details as FieldIssue[] | undefined,
      requestId: err?.requestId as string | undefined,
    })
  }

  return payload
}

/** 単体リソース。エンベロープの data を剥がして返す */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const payload = (await request(path, init)) as { data: T } | undefined
  return payload?.data as T
}

/** 一覧。data と meta をまとめて返す */
export async function apiFetchList<T>(
  path: string,
  init?: RequestInit
): Promise<ListResult<T>> {
  const payload = (await request(path, init)) as {
    data: T[]
    meta: ListResult<T>['meta']
  }
  return { items: payload.data, meta: payload.meta }
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  list: <T>(path: string) => apiFetchList<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
}
