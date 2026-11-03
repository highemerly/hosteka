/**
 * 相手のサーバー（Mastodon / Misskey / Pleroma / Discord / X）から受け取った
 * プロフィールを、保存する前に整える。
 *
 * **表示名は相手のサーバーが決める値。** 偽のサーバーでログインすれば、
 * 何でも返せる。そのまま保存すると:
 *
 * - 改行が入れば、ICS（カレンダー）の `ORGANIZER;CN=...` から別の行を
 *   書き足せる（`ics` は引数の値の改行を逃がさない）
 * - 長さに上限が無く、数MBの名前が参加者の一覧を開く全員の応答に載る
 *
 * 絵文字や結合文字（ZWJ）はそのまま残す。名前の一部として正当に使われる。
 */

/** 各サービスの上限（Mastodon 30・Misskey 50・Discord 32・X 50）より十分に大きく */
export const DISPLAY_NAME_MAX = 100

/** 制御文字と、行・段落の区切り。どれも名前の中にあってよい理由が無い */
const LINE_BREAKING = /[\p{Cc}\u2028\u2029]/gu

/**
 * 表示名を整える。整えた結果が空なら `fallback`（ユーザー名）を使う。
 * 長さは文字（コードポイント）で数える。
 */
export function sanitizeDisplayName(raw: unknown, fallback: string): string {
  const cleaned = (typeof raw === 'string' ? raw : '')
    .replace(LINE_BREAKING, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const name = cleaned || fallback
  return Array.from(name).slice(0, DISPLAY_NAME_MAX).join('')
}

/** アバターの URL。`https:` のものだけを保存する（それ以外は「無し」） */
export function sanitizeAvatarUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null
  try {
    return new URL(raw).protocol === 'https:' ? raw : null
  } catch {
    return null
  }
}
