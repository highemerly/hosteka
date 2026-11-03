import 'server-only'

import { normalizeServer, normalizeUsername } from '@/lib/normalize'
import { SERVER_PATTERN, USERNAME_PATTERN } from '@/lib/user-handle'

/**
 * ログインしてきた人の身元を、保存できる形に整える。
 *
 * **正規化だけでは足りない。** `normalizeUsername` は小文字化するだけで、
 * 値の出どころは**利用者が指定した任意のサーバー**の応答
 * （Mastodon なら `verify_credentials` の `username`）。サーバーの登録は
 * 動的で許可リストが無いので、攻撃者は自分のサーバーに何でも返させられる。
 *
 * `@` 入りの username が保存できると、`username@server` を切り直す判定を
 * 騙せる。実際、日程調整の参加できるサーバーの制限が
 * `session.user.email.split('@')[1]` で判定しており、
 * `attacker@mastodon.social` という username で入れば
 * 「mastodon.social の人」として通った。
 *
 * **判定側を1つ直すだけでは終わらない**ので、書き込む側で形を保証する。
 * 要求する形は読む側（`parseUserHandle`）と同じ — 揃えないと
 * 「ログインはできたのに自分のページが開けない」人ができる。
 *
 * @returns 正規化した身元。形が合わなければ null（ログインを断る）
 */
export type LoginIdentity = { username: string; server: string }

export function loginIdentity(rawUsername: unknown, rawServer: unknown): LoginIdentity | null {
  if (typeof rawUsername !== 'string' || typeof rawServer !== 'string') return null

  const username = normalizeUsername(rawUsername.trim())
  const server = normalizeServer(rawServer.trim())

  if (!USERNAME_PATTERN.test(username)) return null
  if (!SERVER_PATTERN.test(server)) return null

  return { username, server }
}
