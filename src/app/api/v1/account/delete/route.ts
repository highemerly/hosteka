import { prisma } from '@/lib/prisma'
import { validateAccountDeletion } from '@/lib/account-deletion'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { revokeUserSessions } from '@/server/auth/session'

/**
 * アカウントの完全削除。
 *
 * Cascade で削除されるもの: Event（主催）とその関連、EventParticipant、
 * PreEvent、PreEventParticipant、Report、
 * OrganizationAdmin、Session
 * SetNull になるもの: Organization.creatorId、EventAttendance.created/updatedById
 */
export const DELETE = defineRoute({
  auth: 'required',
  handler: async ({ session }) => {
    const userId = session.user.id

    // 競合状態対策のため削除直前に再チェックする
    const { canDelete, blockers } = await validateAccountDeletion(userId)
    if (!canDelete) {
      // 阻害要因の詳細（どのイベントが残っているか）は
      // GET /api/v1/account/data が構造化して返す。消費側もそちらを
      // 再取得する作りなので、ここでは「競合して削除できなくなった」ことだけ
      // 伝えれば足りる。
      throw ApiError.conflict(
        `アカウントを削除できません（${blockers.length}件の未完了イベントがあります）`
      )
    }

    // ユーザー削除で sessions 行は cascade で消えるが、**行の削除は失効ではない**。
    // 失効キャッシュは revokedAt が入った行しか見ないため、先に失効させないと
    // 発行済みJWTが有効期限まで通ってしまう。
    await revokeUserSessions(userId)

    await prisma.user.delete({ where: { id: userId } })

    return { success: true, message: 'アカウントデータが完全に削除されました' }
  },
})
