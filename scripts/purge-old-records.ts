/**
 * 保存期間（90日）を過ぎたセッション履歴と通知を消すスクリプト。
 *
 * 使用方法:
 *   npm run purge:old-records
 *   npx tsx --conditions=react-server scripts/purge-old-records.ts
 *
 * **`--conditions=react-server` が要る。** 処理側は `server-only` の印を
 * 付けてあり、素の tsx から読むと「クライアントから import するな」で落ちる。
 *
 * API（POST /api/v1/admin/purge-old-records）と同じ処理を、管理者の
 * ログインなしで実行する。cron からはこちらを使う。
 *
 * **.env を先に読んでから読み込む。** 処理側は `src/lib/prisma.ts` を
 * import した時点で接続先を決めるので、先に読ませないと接続先が空になる。
 */
import { loadEnvFiles } from '../prisma/env'

async function main() {
  loadEnvFiles()
  const { purgeOldRecords } = await import('../src/server/services/purge-old-records')

  const result = await purgeOldRecords()
  console.log(
    `セッション履歴を ${result.deletedSessions} 件、` +
      `通知を ${result.deletedNotifications} 件削除しました（${result.cutoff} より前）。` +
      `IPの控えを ${result.rewrittenUsers} 人ぶん作り直しました。`
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
