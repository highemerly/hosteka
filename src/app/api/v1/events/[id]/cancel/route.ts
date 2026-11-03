import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { requireEventOwner } from '@/server/http/guards'
import { eventIdParam } from '@/schemas/event'
import { notifyAfter, notifyEventCancelled } from '@/server/notifications/notify'

/**
 * イベントを中止する。参加者の記録は残したまま status だけ変える。
 * **幹事とグループのスタッフにはさせない**（編集はできるが、畳む判断は主催者のもの）
 */
export const POST = defineRoute({
  auth: 'required',
  params: eventIdParam,
  guard: requireEventOwner('中止'),
  handler: async ({ params, session }) => {
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: params.id },
      // title は通知の写しに使う
      select: { status: true, title: true },
    })
    if (event.status === 'cancelled') {
      throw ApiError.conflict('このイベントは既に中止されています')
    }

    const updated = await prisma.event.update({
      where: { id: params.id },
      data: { status: 'cancelled' },
      select: { id: true, status: true },
    })

    notifyAfter('event.cancel', () =>
      notifyEventCancelled({ id: params.id, title: event.title }, session.user.id)
    )

    return updated
  },
})
