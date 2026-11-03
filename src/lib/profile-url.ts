/**
 * SNS 上のプロフィールの URL。管理画面や参加者の編集から当人のアカウントを開くのに使う。
 *
 * **開けないものには null を返す。** Discord はユーザー名から開ける
 * プロフィールの URL が無い。X はサーバー欄が `x.com` 固定で、
 * `/@名前` の形では開けない（Fediverse の書き方）。
 */
export function profileUrl(user: {
  platform: string
  username: string
  server: string
}): string | null {
  switch (user.platform) {
    case 'discord':
      return null
    case 'twitter':
      return `https://x.com/${encodeURIComponent(user.username)}`
    default:
      return `https://${user.server}/@${encodeURIComponent(user.username)}`
  }
}
