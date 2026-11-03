import { prisma } from '@/lib/prisma'
import { normalizeSlug } from '@/lib/normalize'
import { paginationQuery } from '@/schemas/common'
import { orgIdParam } from '@/schemas/org'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { makeMeta, okList } from '@/server/http/response'
import { EVENT_LIST_SELECT } from '@/server/queries/event-list'
import { eventsByOrg } from '@/server/queries/profile-lists'
import { serializeEventListItem } from '@/server/serializers/event'

/**
 * あるグループのイベント（ページ送りつき）。
 *
 * **詳細（`../route.ts`）は一覧を持たない。** 以前は先頭20件だけを詰めて
 * 返し、あふれたぶんはイベント一覧へ送っていたが、送った先でこの
 * グループのものだけを絞れないので探し直しになっていた。
 */
export const GET = defineRoute({
  auth: 'none',
  params: orgIdParam,
  query: paginationQuery,
  handler: async ({ params, query }) => {
    const org = await prisma.organization.findUnique({
      where: { slug: normalizeSlug(params.orgId) },
      select: { id: true },
    })
    if (!org) throw ApiError.notFound('グループが見つかりません')

    const where = eventsByOrg(org.id)

    const [items, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { startDate: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        select: EVENT_LIST_SELECT,
      }),
      prisma.event.count({ where }),
    ])

    return okList(items.map(serializeEventListItem), makeMeta(total, query.page, query.perPage))
  },
})
