import { z } from 'zod'

import { defineRoute } from '@/server/http/define-route'
import { makeMeta, okList } from '@/server/http/response'
import { prisma } from '@/lib/prisma'
import { hashtagParam } from '@/schemas/hashtag'
import { EVENT_LIST_SELECT } from '@/server/queries/event-list'
import { hashtagEventWhere } from '@/server/queries/hashtag'
import { serializeEventListItem } from '@/server/serializers/event'

/**
 * ハッシュタグ別のイベント一覧（`/hashtags/[tag]` の「開催予定」「終了」）。
 * 条件は `server/queries/hashtag.ts`。
 */
export const GET = defineRoute({
  auth: 'none',
  params: hashtagParam,
  query: z.object({
    /** 開催予定か終了済みか。既定は開催予定 */
    scope: z.enum(['upcoming', 'past']).optional().default('upcoming'),
    page: z.coerce.number().int().min(1).optional().default(1),
    perPage: z.coerce.number().int().min(1).max(48).optional().default(12),
  }),
  handler: async ({ params, query }) => {
    const tag = decodeURIComponent(params.hashtag)
    const now = new Date()
    const past = query.scope === 'past'

    const where = hashtagEventWhere(tag, past, now)

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        select: EVENT_LIST_SELECT,
        // 開催予定は近い順、終了済みは新しい順。どちらも「今」に近い側から
        orderBy: { startDate: past ? 'desc' : 'asc' },
        take: query.perPage,
        skip: (query.page - 1) * query.perPage,
      }),
      prisma.event.count({ where }),
    ])

    return okList(events.map(serializeEventListItem), makeMeta(total, query.page, query.perPage))
  },
})
