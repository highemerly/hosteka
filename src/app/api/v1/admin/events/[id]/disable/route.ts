import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { disableBody, idParam } from '@/schemas/admin'

/** イベントの無効化 / 有効化。無効化するとページが閲覧できなくなる */
export const PATCH = defineRoute({
  auth: 'admin',
  params: idParam,
  body: disableBody,
  handler: async ({ params, body }) => {
    const event = await prisma.event.findUnique({
      where: { id: params.id },
      select: { id: true },
    })
    if (!event) throw ApiError.notFound('イベントが見つかりません')

    const updated = await prisma.event.update({
      where: { id: params.id },
      data: { isDisabled: body.isDisabled },
      select: { id: true, isDisabled: true },
    })

    return {
      ...updated,
      message: body.isDisabled ? 'イベントを無効化しました' : 'イベントを有効化しました',
    }
  },
})
