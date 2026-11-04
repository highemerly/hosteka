/**
 * 定期的な後片付け（`src/server/services/maintenance.ts`）を手元から走らせるスクリプト。
 * k8s の CronJob が叩く `POST /api/v1/cron/maintenance` と同じ処理。
 *
 * 使用方法:
 *   npm run cron:maintenance
 *   npx tsx --conditions=react-server scripts/maintenance.ts
 *
 * **`--conditions=react-server` が要る。** 処理側は `server-only` の印を
 * 付けてあり、素の tsx から読むと「クライアントから import するな」で落ちる。
 *
 * **.env を先に読んでから読み込む。** 処理側は `src/lib/prisma.ts` を
 * import した時点で接続先を決めるので、先に読ませないと接続先が空になる。
 */
import { loadEnvFiles } from '../prisma/env'

async function main() {
  loadEnvFiles()
  const { runMaintenance } = await import('../src/server/services/maintenance')

  const { purge, autoCancel } = await runMaintenance()
  console.log(
    `セッション履歴を ${purge.deletedSessions} 件、` +
      `通知を ${purge.deletedNotifications} 件削除しました（${purge.cutoff} より前）。` +
      `IPの控えを ${purge.rewrittenUsers} 人ぶん作り直しました。` +
      `締切を過ぎた ${autoCancel.processedEvents} 件のイベントで、未定 ${autoCancel.totalCancelled} 件をキャンセルにしました。`
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
