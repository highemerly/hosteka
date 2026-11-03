import { prisma } from '@/lib/prisma'
import { validateAccountDeletion, type Blocker, type DeletePreview } from '@/lib/account-deletion'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'

/**
 * 自分のアカウント情報と、削除可否の判定結果。
 *
 * **画面はこの1本だけを見る。** 「消せるか」「何が消えるか」「何が邪魔して
 * いるか」を別々に取ると、判定と表示がずれる瞬間ができる。
 */
export type AccountDataDto = {
  username: string
  server: string
  platform: string
  lastTermsAcceptedAt: string | null
  eventsCreated: number
  eventsParticipated: number
  canDelete: boolean
  blockers: Blocker[]
  deletePreview: DeletePreview
}

export const GET = defineRoute({
  auth: 'required',
  handler: async ({ session }): Promise<AccountDataDto> => {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        username: true,
        server: true,
        platform: true,
        lastTermsAcceptedAt: true,
        _count: { select: { events: true, participants: true } },
      },
    })
    if (!user) throw ApiError.notFound('ユーザーが見つかりません')

    const { canDelete, blockers, deletePreview } = await validateAccountDeletion(
      session.user.id
    )

    return {
      username: user.username,
      server: user.server,
      platform: user.platform,
      // 本人にしか返さないので lastTermsAcceptedAt を含めてよい
      lastTermsAcceptedAt: user.lastTermsAcceptedAt?.toISOString() ?? null,
      eventsCreated: user._count.events,
      eventsParticipated: user._count.participants,
      canDelete,
      blockers,
      deletePreview,
    }
  },
})
