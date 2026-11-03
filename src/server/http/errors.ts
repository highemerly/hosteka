import 'server-only'

/**
 * API のエラーコード体系。
 *
 * **`message` は日本語のユーザー向け文言、`code` が機械可読の契約。**
 * クライアントは message を文字列マッチしてはならない。
 * これにより、現状の英日混在（'Unauthorized' と '認証が必要です' が同じ意味で
 * 混在している）は「英語文言はバグ」という形で解消できる。
 */
export const ERROR_CODES = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
} as const

export type ErrorCode = keyof typeof ERROR_CODES

export type FieldIssue = { path: string; message: string }

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: FieldIssue[]

  constructor(code: ErrorCode, message: string, details?: FieldIssue[]) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = ERROR_CODES[code]
    this.details = details
  }

  /** 未認証。ログインしていない。**常に401**（403にしない） */
  static unauthenticated(message = 'ログインが必要です') {
    return new ApiError('UNAUTHENTICATED', message)
  }

  /** 認証済みだが権限がない */
  static forbidden(message = 'この操作を行う権限がありません') {
    return new ApiError('FORBIDDEN', message)
  }

  static notFound(message = '対象が見つかりません') {
    return new ApiError('NOT_FOUND', message)
  }

  static validation(message = '入力内容に誤りがあります', details?: FieldIssue[]) {
    return new ApiError('VALIDATION_ERROR', message, details)
  }

  static conflict(message: string) {
    return new ApiError('CONFLICT', message)
  }

  static rateLimited(message = 'リクエストが多すぎます。しばらく待ってから再試行してください') {
    return new ApiError('RATE_LIMITED', message)
  }

  static serviceUnavailable(message = '一時的に利用できません。しばらく待ってから再試行してください') {
    return new ApiError('SERVICE_UNAVAILABLE', message)
  }

  static internal(message = '内部エラーが発生しました') {
    return new ApiError('INTERNAL', message)
  }

  /** 生成後に details を足す。conflict など details を取らない生成子と併用する */
  withDetails(details: FieldIssue[]): ApiError {
    return new ApiError(this.code, this.message, details)
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
