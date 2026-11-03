import { prisma } from '@/lib/prisma'
import {
  KINDS_BY_CATEGORY,
  listNotificationsQuery,
  type ListNotificationsQuery,
} from '@/schemas/notification'
import { defineRoute } from '@/server/http/define-route'
import { makeMeta, okList } from '@/server/http/response'
import { readSeenAt } from '@/server/notifications/seen'
import { NOTIFICATION_LIST_SELECT } from '@/server/queries/notification'
import { serializeNotification } from '@/server/serializers/notification'

/**
 * 自分に届いた通知の一覧。
 *
 * 並びは `occurredAt` の新しい順。畳まれた通知は最後に起きた時刻で並ぶので、
 * 「1週間前に作られて今さっき更新された1件」は先頭に来る。
 */

/**
 * `category` が粗い軸、`kind` が細かい軸。**両方あれば両方を満たすもの**を返す
 * （画面は「主催」を選んだうえで「参加リクエストだけ」に絞れる）。
 */
function kindWhere(query: ListNotificationsQuery) {
  const ofCategory = query.category === 'all' ? null : KINDS_BY_CATEGORY[query.category]

  if (query.kind) {
    // 分類に属さない種別を指定されたら、何も返さない（矛盾した絞り込み）
    if (ofCategory && !ofCategory.includes(query.kind)) return { kind: { in: [] } }
    return { kind: query.kind }
  }
  return ofCategory ? { kind: { in: ofCategory } } : {}
}

export const GET = defineRoute({
  auth: 'required',
  query: listNotificationsQuery,
  handler: async ({ query, session }) => {
    const seenAt = await readSeenAt(session.user.id)
    const where = { userId: session.user.id, ...kindWhere(query) }

    const [rows, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        select: NOTIFICATION_LIST_SELECT,
        orderBy: { occurredAt: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.notification.count({ where }),
    ])

    return okList(
      rows.map((row) => serializeNotification(row, seenAt)),
      makeMeta(total, query.page, query.perPage)
    )
  },
})
