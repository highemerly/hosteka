import { prisma } from '@/lib/prisma'
import { revokeUserSessions } from '@/server/auth/session'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { banUserBody, idParam } from '@/schemas/admin'

/**
 * ユーザーをBAN（停止）する。
 *
 * **ユーザーは削除しない。** `BannedUser` 行を作り、その行があることを
 * 停止の状態として扱う。以前は `users` の行を消していたため、BAN の
 * 根拠になった通報も、主催していたものも、参加の記録も cascade で一緒に
 * 消えて、`BannedUser.reason` しか残らなかった。
 *
 * 主催していたイベントと日程調整は**無効化する**（削除ではない）。
 * 無効化は管理者以外の全ルートが既に塞いでいるので、停止した人の主催物は
 * これで表から消える。**解除しても自動では戻さない** — 戻すかどうかは
 * 1件ずつ管理者が決める（`admin/events/[id]/disable`）。
 *
 * 参加・回答の記録は**残す**。主催者にとっては自分のイベントの記録であり、
 * 消すと参加者一覧・出欠・集金の整合が黙って壊れる。
 */
export const POST = defineRoute({
  auth: 'admin',
  params: idParam,
  body: banUserBody,
  handler: async ({ params, body, session }) => {
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        username: true,
        server: true,
        platform: true,
        isAdmin: true,
        ban: { select: { id: true } },
      },
    })
    if (!user) throw ApiError.notFound('ユーザーが見つかりません')
    if (user.isAdmin) {
      throw ApiError.validation('管理者をBANすることはできません')
    }
    if (user.ban) {
      throw ApiError.conflict('このユーザーは既にBANされています')
    }

    // 先にセッションを失効させる。
    // 失効キャッシュは revokedAt が入った行しか見ないため、
    // 先に失効 → 停止の順なら、途中で失敗しても
    // 「BANされていないのにログアウトされる」という安全側に倒れる。
    await revokeUserSessions(user.id)

    await prisma.$transaction(async (tx) => {
      await tx.bannedUser.create({
        data: {
          username: user.username,
          server: user.server,
          platform: user.platform,
          reason: body.reason,
          bannedByAdmin: session.user.id,
          userId: user.id,
        },
      })
      await tx.event.updateMany({
        where: { creatorId: user.id, isDisabled: false },
        data: { isDisabled: true },
      })
      await tx.preEvent.updateMany({
        where: { creatorId: user.id, isDisabled: false },
        data: { isDisabled: true },
      })
    })

    return { success: true }
  },
})
