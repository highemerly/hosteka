import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { looseIdParam } from '@/schemas/admin'

/**
 * BAN（停止）を解除する。
 *
 * `BannedUser` 行を消すと停止が解ける。**削除方式だった頃の記録**
 * （`userId` が null）を消した場合は当人がもう居ないので、
 * 解除の意味は「同じ名前で入り直せるようになる」だけ。
 *
 * **BAN が無効化した主催物は戻さない。** 戻すかどうかは1件ずつ
 * 管理者が決める（`admin/events/[id]/disable`）。
 */
export const POST = defineRoute({
  auth: 'admin',
  params: looseIdParam,
  handler: async ({ params }) => {
    const record = await prisma.bannedUser.findUnique({
      where: { id: params.id },
      select: { id: true },
    })
    if (!record) throw ApiError.notFound('BANユーザーが見つかりません')

    await prisma.bannedUser.delete({ where: { id: params.id } })
    return { success: true }
  },
})
