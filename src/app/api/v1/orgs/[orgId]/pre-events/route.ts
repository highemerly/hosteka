import { prisma } from '@/lib/prisma'
import { normalizeSlug } from '@/lib/normalize'
import { paginationQuery } from '@/schemas/common'
import { orgIdParam } from '@/schemas/org'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { makeMeta, okList } from '@/server/http/response'
import { PRE_EVENT_LIST_SELECT } from '@/server/queries/pre-event-list'
import { preEventsByOrg } from '@/server/queries/profile-lists'
import { serializePreEventListItem } from '@/server/serializers/pre-event'

/**
 * あるグループの日程調整（ページ送りつき）。
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

    const where = preEventsByOrg(org.id)

    const [items, total] = await Promise.all([
      prisma.preEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        select: PRE_EVENT_LIST_SELECT,
      }),
      prisma.preEvent.count({ where }),
    ])

    return okList(items.map(serializePreEventListItem), makeMeta(total, query.page, query.perPage))
  },
})
