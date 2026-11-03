import { prisma } from '@/lib/prisma'
import { parseUserHandle } from '@/lib/user-handle'
import { userHandleParam, userListQuery } from '@/schemas/user'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { makeMeta, okList } from '@/server/http/response'
import { PRE_EVENT_LIST_SELECT } from '@/server/queries/pre-event-list'
import { preEventsByUser } from '@/server/queries/profile-lists'
import { serializePreEventListItem } from '@/server/serializers/pre-event'

/**
 * ある人のページに並べる公開日程調整（ページ送りつき）。
 * `scope` で所属グループのものを含めるかを選ぶ（`preEventsByUser`）。
 *
 * **詳細（`../route.ts`）は一覧を持たない。** 先頭20件だけを詰めて返すと、
 * 2ページ目からこちらを読むことになり、同じものを2通りの経路で出すことに
 * なる。条件がずれたときに気づけないので、一覧はここだけが持つ。
 */
export const GET = defineRoute({
  auth: 'none',
  params: userHandleParam,
  query: userListQuery,
  handler: async ({ params, query }) => {
    const handle = parseUserHandle(params.handle)
    if (!handle) throw ApiError.notFound('ユーザーが見つかりません')

    const user = await prisma.user.findUnique({
      where: { username_server: handle },
      // 停止中の人は詳細も 404。一覧だけ開ける状態を作らない
      select: { id: true, ban: { select: { id: true } } },
    })
    if (!user || user.ban) throw ApiError.notFound('ユーザーが見つかりません')

    const where = preEventsByUser(user.id, query.scope)

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
