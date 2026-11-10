import { z } from 'zod'

import { defineRoute } from '@/server/http/define-route'
import { makeMeta, okList } from '@/server/http/response'
import { prisma } from '@/lib/prisma'
import { hashtagParam } from '@/schemas/hashtag'
import { hashtagPreEventWhere } from '@/server/queries/hashtag'
import { PRE_EVENT_LIST_SELECT } from '@/server/queries/pre-event-list'
import { serializePreEventListItem } from '@/server/serializers/pre-event'

/**
 * ハッシュタグ別の日程調整一覧（`/hashtags/[tag]` の「日程調整中」）。
 * 受付中のものだけを出す（条件は `server/queries/hashtag.ts`）。
 */
export const GET = defineRoute({
  auth: 'none',
  params: hashtagParam,
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    perPage: z.coerce.number().int().min(1).max(48).optional().default(12),
  }),
  handler: async ({ params, query }) => {
    const where = hashtagPreEventWhere(decodeURIComponent(params.hashtag), new Date())

    const [preEvents, total] = await Promise.all([
      prisma.preEvent.findMany({
        where,
        select: PRE_EVENT_LIST_SELECT,
        // 候補日は複数あって並べる鍵にならない。日程調整の一覧の「新着」と同じ順
        orderBy: { createdAt: 'desc' },
        take: query.perPage,
        skip: (query.page - 1) * query.perPage,
      }),
      prisma.preEvent.count({ where }),
    ])

    return okList(
      preEvents.map(serializePreEventListItem),
      makeMeta(total, query.page, query.perPage)
    )
  },
})
