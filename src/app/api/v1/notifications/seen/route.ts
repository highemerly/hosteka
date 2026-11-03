import { defineRoute } from '@/server/http/define-route'
import { markSeen } from '@/server/notifications/seen'

/**
 * 通知をどこまで見たかを今へ進める。
 *
 * **呼ぶのは「利用者が通知を見にいった瞬間」だけ**（ベルを開いたとき、
 * 一覧画面を開いたとき）。画面遷移のたびに呼ぶと既読位置が動き続け、
 * 連続編集がまとまらなくなる（まとまるのは「読む前」だけなので）。
 */

export type NotificationSeenDto = { seenAt: string }

export const POST = defineRoute({
  auth: 'required',
  handler: async ({ session }): Promise<NotificationSeenDto> => {
    const seenAt = await markSeen(session.user.id)
    return { seenAt: seenAt.toISOString() }
  },
})
