import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { readSeenAt } from '@/server/notifications/seen'
import { unreadWhere } from '@/server/notifications/unread'
import { NOTIFICATION_LIST_SELECT } from '@/server/queries/notification'
import { serializeNotification, type NotificationDto } from '@/server/serializers/notification'

/**
 * ヘッダーのベル1つ分。**未読の数と直近の数件を1本で返す。**
 * 全ページで叩くものなので、往復を2本にしない。
 */

/** ポップオーバーに出す件数。これ以上は一覧画面で読む */
export const BELL_RECENT = 5

export type NotificationSummaryDto = {
  unread: number
  recent: NotificationDto[]
}

export const GET = defineRoute({
  auth: 'required',
  handler: async ({ session }): Promise<NotificationSummaryDto> => {
    const seenAt = await readSeenAt(session.user.id)

    const [unread, rows] = await Promise.all([
      prisma.notification.count({
        where: { userId: session.user.id, ...unreadWhere(seenAt) },
      }),
      prisma.notification.findMany({
        where: { userId: session.user.id },
        select: NOTIFICATION_LIST_SELECT,
        orderBy: { occurredAt: 'desc' },
        take: BELL_RECENT,
      }),
    ])

    return { unread, recent: rows.map((row) => serializeNotification(row, seenAt)) }
  },
})
