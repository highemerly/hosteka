/**
 * ユーザー名・サーバー名・組織slugの正規化ユーティリティ。
 *
 * DBのユニーク制約 (User.@@unique([username, server]), BannedUser同様, Organization.slug)
 * は実装上case-insensitiveに扱う必要があるため、書き込み・参照時に必ず本ユーティリティで正規化する。
 *
 * 背景: MySQLの utf8mb4_unicode_ci collation は case-insensitive だったため
 * DB依存で問題が顕在化していなかったが、PostgreSQL移行後は case-sensitive になるため
 * アプリ層での正規化が必須となる。
 */

export function normalizeUsername(username: string): string {
  return username.toLowerCase()
}

export function normalizeServer(server: string): string {
  return server.toLowerCase()
}

export function normalizeSlug(slug: string): string {
  return slug.toLowerCase()
}
