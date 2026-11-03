import { normalizeServer, normalizeUsername } from '@/lib/normalize'

/**
 * ユーザーページの URL に出る「ハンドル」の解釈。
 *
 * `/users/alice@mastodon.social` の `alice@mastodon.social` の部分。
 * `users` の一意キーは `@@unique([username, server])` で、server は必ず
 * ホスト名（X は `x.com` 固定、Discord は `discord.com` 固定、Fediverse は実サーバー。
 * `src/app/api/v1/auth/callback/` 配下）なので、全員が同じ形のハンドルを持つ。
 *
 * **解釈をここ1箇所に閉じ込める。** URL から来る形は思ったより多い
 * （`%40` に符号化されたもの、Fediverse の書き方をそのまま貼った `@alice@server`、
 * 大文字混じり）。画面・API・メタデータで書き分けると、同じ人のページが
 * 入り方によって 404 になる。
 *
 * このファイルは isomorphic（`prisma` も `server-only` も import しない）。
 */

export type UserHandle = { username: string; server: string }

/**
 * ユーザー名として受け付ける形。Fediverse・X・Discord のどれも収まる。
 *
 * **保存するときも同じものを使う**（`server/auth/login-identity.ts`）。
 * 読む側だけが検証していた頃は、相手のサーバーが `@` 入りの username を
 * 返すとそのまま保存され、`username@server` を切り直す判定を騙せた。
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/

/**
 * ホスト名として受け付ける形。
 *
 * **ログイン画面の `isValidServerHost` と同じ正規表現にしてある。**
 * 書き分けると「ログインはできたのに自分のページが開けない」人ができる。
 */
export const SERVER_PATTERN = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

export function parseUserHandle(raw: string): UserHandle | null {
  /*
    **符号化されていても受ける。** `@` は予約文字ではないので素のまま
    来ることが多いが、`%40` で来ることもある。`%` を含まない文字列は
    decode してもそのまま返る（`src/app/events/hashtag/[hashtag]/page.tsx`
    が同じ理由で無条件に decode している）。壊れた符号化で投げるので包む。
  */
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    decoded = raw
  }

  // Fediverse の書き方（`@alice@server`）をそのまま貼る人がいる
  const trimmed = decoded.trim().replace(/^@/, '')

  /*
    **最後の `@` で割る。** username 側に `@` は入らないが、後ろから
    割っておけば、前に増えても server の解釈が動かない。
  */
  const at = trimmed.lastIndexOf('@')
  if (at <= 0 || at === trimmed.length - 1) return null

  const username = trimmed.slice(0, at)
  const server = trimmed.slice(at + 1)

  if (!USERNAME_PATTERN.test(username)) return null
  if (!SERVER_PATTERN.test(server)) return null

  /*
    **必ず正規化する。** PostgreSQL の一意制約は case-sensitive なので、
    畳まないと `/users/Alice@…` が 404 になる（`src/lib/normalize.ts`）。
  */
  return { username: normalizeUsername(username), server: normalizeServer(server) }
}

/** 画面に出す形。`@` は前に付けない（付けるかは出す側が決める） */
export function formatUserHandle(user: UserHandle): string {
  return `${user.username}@${user.server}`
}

/**
 * ユーザーページへのリンク先。
 *
 * **`@` は符号化しない。** RFC 3986 ではパスに置ける文字で、`%40` に
 * すると URL 欄に出たときも共有されたときも読めない。username と server は
 * `parseUserHandle` が英数字・`.`・`-`・`_` しか通さないので、
 * ほかに符号化が要る文字は入らない。
 */
export function userProfilePath(user: UserHandle): string {
  return `/users/${formatUserHandle(user)}`
}
