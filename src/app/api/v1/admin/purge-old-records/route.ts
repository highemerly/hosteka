import { defineRoute } from '@/server/http/define-route'
import { purgeOldRecords } from '@/server/services/purge-old-records'

/**
 * 保存期間（90日）を過ぎたセッション履歴と通知を消す。
 *
 * cron から定期実行する。k8s の CronJob が `CRON_SECRET` を添えて叩く
 * （`k8sg1` の `manifests/hosteka/prd/cronjob.yaml`）。
 * 手元からは `npm run purge:old-records` でも同じ処理を走らせられる。
 */
export const POST = defineRoute({
  auth: 'cron',
  handler: async () => purgeOldRecords(),
})
