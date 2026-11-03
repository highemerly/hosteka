import { defineRoute } from '@/server/http/define-route'
import { autoCancelMaybeForAll } from '@/server/services/auto-cancel-maybe'

/**
 * 期限切れの「未定」参加者を一括でキャンセルにする。
 *
 * 本来は cron から定期実行する。詳細を開いたときにも回るが、
 * 誰も開かないイベントはこの経路でしか片付かない。
 */
export const POST = defineRoute({
  auth: 'admin',
  handler: async () => autoCancelMaybeForAll(),
})
