import { defineRoute } from '@/server/http/define-route'
import { requireEventOrganizer } from '@/server/http/guards'
import { autoCancelMaybeForEvent } from '@/server/services/auto-cancel-maybe'
import { eventIdParam } from '@/schemas/event'

/** 1イベントぶんの期限切れ「未定」参加者をキャンセルにする */
export const POST = defineRoute({
  auth: 'required',
  params: eventIdParam,
  guard: requireEventOrganizer('参加状態の一括変更'),
  handler: async ({ params }) => {
    const result = await autoCancelMaybeForEvent(params.id)
    return result ?? { cancelledCount: 0, eventId: params.id }
  },
})
