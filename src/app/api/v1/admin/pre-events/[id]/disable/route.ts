import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { disableBody, idParam } from '@/schemas/admin'

export const PATCH = defineRoute({
  auth: 'admin',
  params: idParam,
  body: disableBody,
  handler: async ({ params, body }) => {
    const preEvent = await prisma.preEvent.findUnique({
      where: { id: params.id },
      select: { id: true },
    })
    if (!preEvent) throw ApiError.notFound('日程調整が見つかりません')

    const updated = await prisma.preEvent.update({
      where: { id: params.id },
      data: { isDisabled: body.isDisabled },
      select: { id: true, isDisabled: true },
    })

    return {
      ...updated,
      message: body.isDisabled ? '日程調整を無効化しました' : '日程調整を有効化しました',
    }
  },
})
