import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { revokeSession } from '@/server/auth/session'

const params = z.object({ id: z.string().trim().min(1) })

/**
 * セッションを1つ失効させる（`/account/sessions`）。
 *
 * **他人のセッションIDを渡されても消せないこと**が、このルートの要点。
 * `revokeSession` は所有者を見ないので、ここで自分の行かどうかを確かめる。
 */
export const DELETE = defineRoute({
  auth: 'required',
  params,
  handler: async ({ params, session }) => {
    if (params.id === session.sessionId) {
      /*
        いま使っているセッションはここから切らない。切ると Cookie だけが
        残り、次の操作で黙って弾かれる（画面はログイン中の姿のまま）。
        終わらせたい人にはログアウトがある。
      */
      throw ApiError.validation('この端末はログアウトから終了してください')
    }

    const target = await prisma.session.findFirst({
      where: { id: params.id, userId: session.user.id, revokedAt: null },
      select: { id: true },
    })
    // 他人のセッションでも「無い」と答える。存在を教えない
    if (!target) throw ApiError.notFound('対象のセッションが見つかりません')

    await revokeSession(target.id)
    return { revoked: true }
  },
})
