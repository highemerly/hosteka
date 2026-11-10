import 'server-only'

import type { Prisma } from '@/generated/prisma/client'

import { endedCondition, PUBLIC_EVENT_CONDITIONS } from './event-list'
import { openPreEventConditions, PUBLIC_PRE_EVENT_CONDITIONS } from './pre-event-list'

/**
 * ハッシュタグのページが引く条件。**一覧と件数で同じものを使う**
 * （`api/v1/hashtags/[hashtag]` の件数と、各一覧の件数が食い違わないように）。
 */

/**
 * hashtags は JSON 文字列の列なので、**引用符ごと**一致させる。
 * 素の `contains: 'LT'` では `LT大会` にも当たり、別のタグのものが混ざる。
 * 引用符や `\` を含むタグも、保存したときと同じ形に揃うよう JSON で書く。
 */
function hashtagMatch(tag: string) {
  return { hashtags: { contains: JSON.stringify(tag) } }
}

export function hashtagEventWhere(tag: string, past: boolean, now: Date): Prisma.EventWhereInput {
  return { AND: [...PUBLIC_EVENT_CONDITIONS, hashtagMatch(tag), endedCondition(past, now)] }
}

/**
 * 日程調整は**受付中のものだけ。** イベントにしたものは同じタグがイベントに
 * 写っているのでそちらに出る。候補日が過ぎたまま決まらなかったものは出さない。
 */
export function hashtagPreEventWhere(tag: string, now: Date): Prisma.PreEventWhereInput {
  return {
    AND: [...PUBLIC_PRE_EVENT_CONDITIONS, ...openPreEventConditions(now), hashtagMatch(tag)],
  }
}
