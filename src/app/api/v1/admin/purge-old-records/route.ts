import { defineRoute } from '@/server/http/define-route'
import { runMaintenance } from '@/server/services/maintenance'

/**
 * **移行中の古い口。** 定期的な後片付けは `POST /api/v1/cron/maintenance` に移した。
 * k8s の CronJob がまだこちらを叩いているあいだも「未定」のキャンセルまで回るよう、
 * 中身は同じものを呼ぶ。CronJob を新しい口へ替えたら（k8sg1）、このルートは消す。
 */
export const POST = defineRoute({
  auth: 'cron',
  handler: async () => runMaintenance(),
})
