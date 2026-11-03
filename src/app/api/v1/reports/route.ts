import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { created } from '@/server/http/response'
import { createReportBody } from '@/schemas/report'

/** 通報を作成する。ログインユーザーなら誰でも可能 */
export const POST = defineRoute({
  auth: 'required',
  body: createReportBody,
  handler: async ({ body, session }) => {
    // 対象の存在確認。存在しないIDでの通報を弾く
    if (body.eventId) {
      const event = await prisma.event.findUnique({
        where: { id: body.eventId },
        select: { id: true },
      })
      if (!event) throw ApiError.notFound('イベントが見つかりません')
    } else if (body.preEventId) {
      const preEvent = await prisma.preEvent.findUnique({
        where: { id: body.preEventId },
        select: { id: true },
      })
      if (!preEvent) throw ApiError.notFound('日程調整が見つかりません')
    }

    const report = await prisma.report.create({
      data: {
        reason: body.reason,
        reporterId: session.user.id,
        eventId: body.eventId ?? null,
        preEventId: body.preEventId ?? null,
      },
      select: { id: true },
    })

    return created({ id: report.id })
  },
})
