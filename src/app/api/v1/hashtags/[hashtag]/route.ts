import { defineRoute } from '@/server/http/define-route'
import { prisma } from '@/lib/prisma'
import type { HashtagScope } from '@/schemas/hashtag'
import { hashtagParam } from '@/schemas/hashtag'
import { hashtagEventWhere, hashtagPreEventWhere } from '@/server/queries/hashtag'

/**
 * ハッシュタグのページの、切り替えごとの件数。
 *
 * **見出しに件数を出すために要る。** 一覧を3つに分けたので、開いた先が
 * 「開催予定」だけだと、日程調整中のものがあっても気づけない。
 * 一覧を3本とも読むと重いので、数えるだけにする。
 */
export type HashtagSummaryDto = { counts: Record<HashtagScope, number> }

export const GET = defineRoute({
  auth: 'none',
  params: hashtagParam,
  handler: async ({ params }) => {
    const tag = decodeURIComponent(params.hashtag)
    const now = new Date()

    const [upcoming, preEvents, past] = await Promise.all([
      prisma.event.count({ where: hashtagEventWhere(tag, false, now) }),
      prisma.preEvent.count({ where: hashtagPreEventWhere(tag, now) }),
      prisma.event.count({ where: hashtagEventWhere(tag, true, now) }),
    ])

    const dto: HashtagSummaryDto = {
      counts: { upcoming, 'pre-events': preEvents, past },
    }
    return dto
  },
})
