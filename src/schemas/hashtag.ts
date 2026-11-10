import { z } from 'zod'

/**
 * ハッシュタグのページ（`/hashtags/[tag]`）。イベントと日程調整の両方を出す。
 */

/** URL のタグ。符号化されたまま来るので、使う側が decode する */
export const hashtagParam = z.object({ hashtag: z.string().min(1).max(100) })

/**
 * ページの切り替え。**イベントと日程調整を1つの一覧に混ぜない** —
 * 2つの表をまたいでページを送ることになり、並べる順も決まらない
 * （イベントは開催日、日程調整は候補日が複数）。
 */
export const HASHTAG_SCOPES = ['upcoming', 'pre-events', 'past'] as const
export type HashtagScope = (typeof HASHTAG_SCOPES)[number]

export function isHashtagScope(value: string | null): value is HashtagScope {
  return (HASHTAG_SCOPES as readonly (string | null)[]).includes(value)
}
