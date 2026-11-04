import { defineRoute } from '@/server/http/define-route'
import { autoCancelMaybeForAll } from '@/server/services/auto-cancel-maybe'

/**
 * 期限切れの「未定」参加者を一括でキャンセルにする。
 *
 * 定期実行は `POST /api/v1/cron/maintenance`（2時間おき）が受け持つ。これは管理者が
 * 手で一括実行する口。
 */
export const POST = defineRoute({
  auth: 'admin',
  handler: async () => autoCancelMaybeForAll(),
})
