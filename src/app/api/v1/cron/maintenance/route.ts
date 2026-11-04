import { defineRoute } from '@/server/http/define-route'
import { runMaintenance } from '@/server/services/maintenance'

/**
 * 定期的な後片付け（`server/services/maintenance.ts`）。k8s の CronJob が `CRON_SECRET` を
 * 添えて2時間おきに叩く。人のログインを持てないので、合言葉で確かめる（`auth: 'cron'`）。
 */
export const POST = defineRoute({
  auth: 'cron',
  handler: async () => runMaintenance(),
})
