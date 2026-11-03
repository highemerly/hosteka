import { z } from 'zod'

import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { requireEventOrganizer } from '@/server/http/guards'
import { USER_PUBLIC_SELECT } from '@/lib/select-presets'
import { serializeAttendance } from '@/server/serializers/event'
import { eventIdParam } from '@/schemas/event'
import { prisma } from '@/lib/prisma'

// 出欠情報の一覧取得
export const GET = defineRoute({
  auth: 'required',
  params: eventIdParam,
  guard: requireEventOrganizer('出欠の閲覧'),
  handler: async ({ params }) => {
    const event = await prisma.event.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        title: true,
        fee: true,
        participants: {
          // **キャンセルした人は出さない。** 当日その場にいない
          where: { status: { in: ['attending', 'maybe', 'not_attending'] } },
          orderBy: { createdAt: 'asc' },
          select: {
            userId: true,
            status: true,
            comment: true,
            user: { select: USER_PUBLIC_SELECT },
            // 当日その場で要る（食事の受け渡しなど）。グループ名まで取る
            groupSelections: {
              select: {
                group: { select: { title: true } },
                textAnswer: true,
                options: { select: { option: { select: { name: true } } } },
              },
            },
          },
        },
        attendances: {
          select: { userId: true, attendStatus: true, feeStatus: true, memo: true },
        },
      },
    })

    if (!event) throw ApiError.notFound('イベントが見つかりません')

    return serializeAttendance(event)
  },
})

// 出欠情報の更新
export const POST = defineRoute({
  auth: 'required',
  params: eventIdParam,
  body: z.object({
    userId: z.string().trim().min(1, 'ユーザーIDが必要です'),
    attendStatus: z.enum(['present', 'absent', 'not_entered']).optional(),
    feeStatus: z.enum(['paid', 'unpaid', 'not_entered']).optional(),
    memo: z.string().trim().max(500).nullish(),
  }),
  guard: requireEventOrganizer('出欠の記録'),
  handler: async ({ params, body, session }) => {
    const eventId = params.id
    const { userId, attendStatus, feeStatus, memo } = body

    // userId / attendStatus / feeStatus / memo の検証はスキーマ側で済んでいる

    // 参加者が存在するかチェック
    const participant = await prisma.eventParticipant.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId
        }
      }
    })

    if (!participant) {
      throw ApiError.notFound('参加者が見つかりません')
    }

    // 出欠情報をupsert
    const attendance = await prisma.eventAttendance.upsert({
      where: {
        eventId_userId: {
          eventId,
          userId
        }
      },
      update: {
        ...(attendStatus !== undefined && { attendStatus }),
        ...(feeStatus !== undefined && { feeStatus }),
        ...(memo !== undefined && { memo }),
        updatedById: session.user.id,
        updatedAt: new Date()
      },
      create: {
        eventId,
        userId,
        attendStatus: attendStatus || 'not_entered',
        feeStatus: feeStatus || 'not_entered',
        memo: memo || null,
        createdById: session.user.id,
        updatedById: session.user.id
      },
      select: { userId: true, attendStatus: true, feeStatus: true, memo: true },
    })

    /*
      **保存した結果をそのまま返す。** 画面は押した瞬間に見た目を変えて
      おり（当日その場で使うため）、返ってきた値で確定させる。
    */
    return attendance

  },
})