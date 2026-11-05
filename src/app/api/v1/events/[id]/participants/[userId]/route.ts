import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { requireEventOrganizer } from '@/server/http/guards'
import { eventParticipantParam, participantActionBody } from '@/schemas/event'
import {
  ADMIN_ACTION_TARGET,
  allowedAdminActions,
  STATUS_LABEL_JA,
  type ParticipantAdminAction,
  type ParticipantStatus,
} from '@/lib/status-transition'
import { prisma } from '@/lib/prisma'
import { lockEventSeats } from '@/server/events/participation-rules'
import {
  notifyAfter,
  notifyOrganizerChanged,
  notifyParticipationDecided,
  notifyParticipationRemoved,
} from '@/server/notifications/notify'

/**
 * 参加者の編集画面の操作。**1つの操作をその場で反映する。**
 *
 * できる操作は `allowedAdminActions` が決める。**ここに同じ規則を書き写さない**
 * — 画面のボタンも同じ関数から作るので、二重に持つと「押せるのに
 * 送ると失敗するボタン」ができる。
 */
async function loadTarget(eventId: string, userId: string, viewerId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    // title は通知の写しに使う（対象が消えても文言が組めるように）
    select: { id: true, title: true, status: true, creatorId: true, maxParticipants: true },
  })
  if (!event) throw ApiError.notFound('イベントが見つかりません')

  if (event.status === 'cancelled') {
    throw ApiError.forbidden('中止されたイベントの参加者は編集できません')
  }

  const participant = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { id: true, status: true, isOrganizer: true },
  })
  if (!participant) throw ApiError.notFound('参加者が見つかりません')

  const viewer = { isCreator: event.creatorId === viewerId }
  const status = participant.status as ParticipantStatus
  const actions = allowedAdminActions(
    { status, isOrganizer: participant.isOrganizer, isCreator: userId === event.creatorId },
    viewer
  )
  return { event, participant, status, viewer, actions }
}

function assertAllowed(
  action: ParticipantAdminAction,
  { status, viewer, actions }: Awaited<ReturnType<typeof loadTarget>>
) {
  // 権限の問題（幹事が幹事を指定しようとした）は 403、状態の問題は 400
  const organizerAction = action === 'assign_organizer' || action === 'unassign_organizer'
  if (organizerAction && !viewer.isCreator) {
    throw ApiError.forbidden('幹事の指定は主催者のみ可能です')
  }
  if (!actions.includes(action)) {
    throw ApiError.validation(`「${STATUS_LABEL_JA[status]}」の人にはこの操作はできません`)
  }
}

/**
 * 読んでから書くまでに状態が動いていたら書かない。
 * 本人が同時にキャンセルした人を「承認」すると、同意の無い参加者ができる。
 */
function assertUpdated(count: number) {
  if (count === 0) {
    throw ApiError.conflict('参加状態が変わっていたため、操作しませんでした')
  }
}

export const PATCH = defineRoute({
  auth: 'required',
  params: eventParticipantParam,
  body: participantActionBody,
  guard: requireEventOrganizer('参加者の管理'),
  handler: async ({ params, body, session }) => {
    const target = await loadTarget(params.id, params.userId, session.user.id)
    assertAllowed(body.action, target)
    const { event, participant, status } = target
    const where = { id: participant.id, status }
    // 通知に渡すのは id と名前だけ。作成者や定員まで持ち回らない
    const eventRef = { id: event.id, title: event.title }

    if (body.action === 'approve') {
      await prisma.$transaction(async (tx) => {
        /*
          **定員を超えて承認したら、定員のほうを増やす。** 承認は主催者が
          「この人も入れる」と決めた結果なので、定員で弾かない。

          数える前に席をロックする（`lockEventSeats`）。参加登録と同時に
          走ると、どちらも相手の1人を数えずに書き、定員を1人超える。
        */
        const maxParticipants = await lockEventSeats(tx, event.id)
        if (maxParticipants) {
          const attending = await tx.eventParticipant.count({
            where: { eventId: event.id, status: 'attending' },
          })
          if (attending + 1 > maxParticipants) {
            await tx.event.update({
              where: { id: event.id },
              data: { maxParticipants: attending + 1 },
            })
          }
        }
        const { count } = await tx.eventParticipant.updateMany({
          where,
          data: { status: 'attending', cancellationReason: null },
        })
        assertUpdated(count)
      })
      notifyAfter('participant.approve', () =>
        notifyParticipationDecided(eventRef, params.userId, true, session.user.id)
      )
      return { status: 'attending', isOrganizer: participant.isOrganizer }
    }

    const next = ADMIN_ACTION_TARGET[body.action]
    if (next === 'cancelled') {
      /*
        **キャンセルにしたら幹事も外す。** 幹事の権限は参加状態を見ないので、
        残すと参加していない人が参加者を編集できる。いまは幹事の行にキャンセルを
        出さない（`allowedAdminActions`）ので、ここへ来るのは幹事でない人だけ。
      */
      const { count } = await prisma.eventParticipant.updateMany({
        where,
        data: { status: 'cancelled', cancellationReason: 'admin_cancelled', isOrganizer: false },
      })
      assertUpdated(count)

      /*
        **見送りと取り消しを言い分ける。** 参加リクエストを断られたのと、
        参加していたのを主催者に外されたのとでは、本人にとって意味が違う。
      */
      notifyAfter('participant.cancel', () =>
        body.action === 'reject'
          ? notifyParticipationDecided(eventRef, params.userId, false, session.user.id)
          : notifyParticipationRemoved(eventRef, params.userId, session.user.id)
      )
      return { status: 'cancelled', isOrganizer: false }
    }

    const isOrganizer = body.action === 'assign_organizer'
    const { count } = await prisma.eventParticipant.updateMany({
      where,
      data: { isOrganizer },
    })
    assertUpdated(count)

    notifyAfter('participant.organizer', () =>
      notifyOrganizerChanged(eventRef, params.userId, isOrganizer, session.user.id)
    )
    return { status, isOrganizer }
  },
})

/**
 * 欠席・キャンセルの人の記録を消す。**回答したこと自体を無かったことにする。**
 *
 * 選んだオプション（cascade）と出欠の記録も消す。出欠は参加者の行に
 * ぶら下がっていないので、明示的に消さないと残る。
 */
export const DELETE = defineRoute({
  auth: 'required',
  params: eventParticipantParam,
  guard: requireEventOrganizer('参加者の管理'),
  handler: async ({ params, session }) => {
    const target = await loadTarget(params.id, params.userId, session.user.id)
    assertAllowed('delete', target)

    await prisma.$transaction(async (tx) => {
      const { count } = await tx.eventParticipant.deleteMany({
        where: { id: target.participant.id, status: target.status },
      })
      assertUpdated(count)
      await tx.eventAttendance.deleteMany({
        where: { eventId: params.id, userId: params.userId },
      })
    })
    return { success: true }
  },
})
