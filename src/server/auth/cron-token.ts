import 'server-only'

import crypto from 'crypto'

/**
 * cron から叩くルートの合言葉。
 *
 * **人のログインを持てない相手のための認証。** k8s の CronJob には
 * セッションが無く、管理者としてログインもできない。とはいえ無認証で
 * 開けると、クラスタの中の誰でも保守処理を走らせられる。
 *
 * `CRON_SECRET` は**セッションの署名鍵とは別に持つ**。あちらは保存済み
 * アクセストークンの暗号鍵の導出元でもあり、取り替えが効かない
 * （`secret.ts`）。こちらは取り替えてよい値にしておく。
 */
export function verifyCronToken(header: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const presented = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
  if (!presented) return false

  const expected = Buffer.from(secret, 'utf8')
  const actual = Buffer.from(presented, 'utf8')
  // 長さが違うと timingSafeEqual が投げる
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}
