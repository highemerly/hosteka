import 'server-only'

import { autoCancelMaybeForAll } from './auto-cancel-maybe'
import { purgeOldRecords, type PurgeResult } from './purge-old-records'

/**
 * 定期的な後片付け。k8s の CronJob が2時間おきに `POST /api/v1/cron/maintenance` を叩く
 * （`k8sg1` の `manifests/hosteka/prd/cronjob.yaml`）。手元からは `npm run cron:maintenance`。
 *
 * **cron はこの1本だけにする。** 定期的にやることが増えたら、ここに足す。
 *
 * 1. 保存期間（90日）を過ぎたセッション履歴と通知を消す（プライバシーポリシーの約束）
 * 2. 締切を過ぎた「未定」をキャンセルにする。詳細を開いたときにも回るが、
 *    誰も開かないイベントはここでしか片付かない
 *
 * どちらも何度動かしても結果は同じになる。
 */
export type MaintenanceResult = {
  purge: PurgeResult
  autoCancel: { processedEvents: number; totalCancelled: number }
}

export async function runMaintenance(now = new Date()): Promise<MaintenanceResult> {
  const purge = await purgeOldRecords(now)
  const { processedEvents, totalCancelled } = await autoCancelMaybeForAll(now)
  return { purge, autoCancel: { processedEvents, totalCancelled } }
}
