import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { requireEventOrganizer } from '@/server/http/guards'
import { eventIdParam } from '@/schemas/event'
import { prisma } from '@/lib/prisma'
import { USER_PUBLIC_SELECT } from '@/lib/select-presets'
import { serializeManageParticipants } from '@/server/serializers/event'

/**
 * 参加者を編集する画面に要るものを1つにまとめて返す。
 * 操作は `participants/[userId]` へ1つずつ送る。
 *
 * **詳細のDTOでは足りない。** あちらの参加者は表示用で、選んだ
 * オプションを名前でしか持たない。編集にはIDが要る。かといって
 * 詳細に足すと、閲覧するだけの人にも配ることになる。
 */
export const GET = defineRoute({
  auth: 'required',
  params: eventIdParam,
  guard: requireEventOrganizer('参加者の管理'),
  handler: async ({ params, session }) => {
    const event = await prisma.event.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        title: true,
        status: true,
        allowMaybe: true,
        allowParticipationRequest: true,
        creatorId: true,
        optionGroups: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            title: true,
            responseType: true,
            options: {
              orderBy: { displayOrder: 'asc' },
              select: { id: true, name: true, maxParticipants: true },
            },
          },
        },
        participants: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            userId: true,
            status: true,
            comment: true,
            isOrganizer: true,
            createdAt: true,
            user: { select: USER_PUBLIC_SELECT },
            groupSelections: {
              select: {
                groupId: true,
                textAnswer: true,
                options: { select: { option: { select: { id: true, name: true } } } },
              },
            },
          },
        },
      },
    })
    if (!event) throw ApiError.notFound('イベントが見つかりません')

    return serializeManageParticipants(event, session.user.id)
  },
})
