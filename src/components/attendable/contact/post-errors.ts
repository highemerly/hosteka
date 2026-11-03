import { ApiClientError } from '@/lib/api/client'

/**
 * 投稿の権限が足りなくて断られたか。
 *
 * **文言で判定しない。** 旧実装はエラーの文字列を「権限」「403」
 * 「Unauthorized」で探していたが、これは相手のサーバーが返した文言なので、
 * 言語も内容も向こう次第で変わる（CLAUDE.md: クライアントは `message` を
 * 文字列マッチしてはならない）。サーバーが `details` に置く印で見分ける。
 *
 * **投稿の権限は事前に分からない。** 付与された scope をどこにも
 * 保存していないため、読み取りだけのトークンでも「投稿できる」ように
 * 見える。実際に断られて初めて分かるので、そこから入り直しへ案内する。
 */
export const WRITE_PERMISSION_PATH = 'writePermission'

export function isWritePermissionError(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    error.code === 'FORBIDDEN' &&
    (error.details ?? []).some((d) => d.path === WRITE_PERMISSION_PATH)
  )
}
