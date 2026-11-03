/**
 * 入力されたサーバー名を正規化する。
 *
 * `https://example.social/` や `@user@example.social` の貼り付けも受ける。
 * **保存する前にここを通す。** 表記ゆれのまま保存すると、参加可否の
 * 判定（`serverNames.includes(userServer)`）が静かに外れる。
 */
export function normalizeHost(input: string): string | null {
  let s = input.trim().toLowerCase()
  if (!s) return null

  s = s.replace(/^https?:\/\//, '')
  // パスを先に落とす。`http://example.social/@user` の @ を拾わないため
  s = s.split('/')[0]
  if (s.includes('@')) s = s.slice(s.lastIndexOf('@') + 1)
  s = s.replace(/\.+$/, '')

  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null
  if (s.split('.').some((label) => label.startsWith('-') || label.endsWith('-'))) return null

  return s
}
