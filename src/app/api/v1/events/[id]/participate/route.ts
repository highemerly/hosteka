import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { requireVisibleEvent } from '@/server/http/guards'
import { created } from '@/server/http/response'
import { eventIdParam, participateBody } from '@/schemas/event'
import { canUserChangeStatus, type ParticipantStatus } from '@/lib/status-transition'
import { prisma } from '@/lib/prisma'
import { notifyAfter, notifyParticipationChanged } from '@/server/notifications/notify'
import { resolveGroupSelections, writeGroupSelections } from '@/server/events/participant-selections'
import {
  assertEligible,
  assertOptionSeatsAvailable,
  assertSeatAvailable,
  assertStatusAccepted,
  isActiveStatus,
  loadEventForParticipation,
  PARTICIPATION_DETAIL_INCLUDE,
} from '@/server/events/participation-rules'

/*
  **作成（POST）と変更（PUT）で同じ判定を書き写さない。** 受け付けているか・
  参加できる人か・席が空いているかは `server/events/participation-rules.ts` が
  持つ。ここに残すのは、作成と変更で前提が違うもの（規約への同意、状態の遷移）だけ。
*/

export const POST = defineRoute({
  auth: 'required',
  params: eventIdParam,
  body: participateBody,
  guard: requireVisibleEvent(),
  handler: async ({ params, body, session }) => {
    const id = params.id
    const {
      status = 'attending',
      comment,
      termsAccepted,
      selectedGroupOptions = {},
      groupTextAnswers = {},
    } = body

    const event = await loadEventForParticipation(id)
    assertStatusAccepted(event, status)

    /*
      規約同意チェック。
      **欠席には求めない。** 参加しない人に参加規約への同意を求めるのは
      筋が通らないうえ、同意しないと欠席の回答すら残せなくなる。
      PUT 側も同じ扱い（becomingActive）。
    */
    const active = isActiveStatus(status)
    if (event.terms && active && !termsAccepted) {
      throw ApiError.validation('参加規約への同意が必要です')
    }

    // 作成はどの状態でも見る。参加できない人の行を作らない
    assertEligible(event, session.user)

    const existingParticipation = await prisma.eventParticipant.findUnique({
      where: {
        eventId_userId: {
          eventId: id,
          userId: session.user.id,
        },
      },
    })

    if (existingParticipation) {
      throw ApiError.validation('既に参加登録されています。参加内容の変更から操作してください')
    }

    // トランザクションで参加とオプション選択を処理
    const participation = await prisma.$transaction(async (tx) => {
      // 満員チェック（参加の場合のみ。参加リクエストと未定は席を取らない）
      if (status === 'attending') {
        await assertSeatAvailable(tx, id, session.user.id)
      }

      // 参加記録を作成
      const createdParticipation = await tx.eventParticipant.create({
        data: {
          eventId: id,
          userId: session.user.id,
          status,
          comment: comment || null,
          termsAccepted: event.terms ? termsAccepted : true,
          termsAcceptedAt: event.terms && termsAccepted ? new Date() : null,
          cancellationReason: status === 'cancelled' ? 'user_cancelled' : null,
        },
      })

      // オプション・アンケートの回答を保存（自由入力もここを通る）
      if (active) {
        const answers = { selectedGroupOptions, groupTextAnswers }
        await assertOptionSeatsAvailable(tx, {
          eventId: id,
          userId: session.user.id,
          status,
          groups: event.optionGroups,
          chosenOptionIds: resolveGroupSelections(event.optionGroups, answers).flatMap((w) => w.optionIds),
          kept: new Set(),
        })
        await writeGroupSelections(tx, createdParticipation.id, event.optionGroups, answers)
      }

      return createdParticipation
    })

    // 詳細情報と一緒に返す
    const participationWithDetails = await prisma.eventParticipant.findUnique({
      where: { id: participation.id },
      include: PARTICIPATION_DETAIL_INCLUDE,
    })

    /*
      主催・幹事へ知らせる。**応答の後ろに回す**（`notifyAfter`）。
      通知を作れなかったことで参加登録が巻き戻ったら本末転倒なので、
      トランザクションの外に出したうえで例外も外へ出さない。
    */
    notifyAfter('participate.create', () =>
      notifyParticipationChanged(
        { id: event.id, title: event.title },
        session.user.id,
        status as ParticipantStatus
      )
    )

    return created(participationWithDetails)
  },
})

export const PUT = defineRoute({
  auth: 'required',
  params: eventIdParam,
  body: participateBody,
  guard: requireVisibleEvent(),
  handler: async ({ params, body, session }) => {
    const id = params.id
    const {
      status = 'attending',
      comment,
      termsAccepted,
      selectedGroupOptions = {},
      groupTextAnswers = {},
    } = body

    const event = await loadEventForParticipation(id)

    const participation = await prisma.eventParticipant.findUnique({
      where: {
        eventId_userId: {
          eventId: id,
          userId: session.user.id,
        },
      },
    })

    if (!participation) {
      throw ApiError.notFound('このイベントには参加登録していません')
    }

    /*
      規約への同意。**キャンセルからの再登録がここを通る。**
      行が残っているので PUT になるが、参加としては新規なので
      同意を取り直す必要がある。既に同意済みならそのまま通す。
    */
    const becomingActive = isActiveStatus(status)
    if (event.terms && becomingActive && !participation.termsAccepted && !termsAccepted) {
      throw ApiError.validation('参加規約への同意が必要です')
    }

    assertStatusAccepted(event, status, { current: participation.status })

    // 遷移可否は lib/status-transition.ts に集約している。
    // 以前はここに同じ規則が書き写されており、あちらはユニットテスト済みなのに
    // 本番コードからは一度も呼ばれていなかった。
    const transition = canUserChangeStatus(
      participation.status as ParticipantStatus,
      status as ParticipantStatus
    )
    if (!transition.allowed) {
      /*
        どこへ移せるかは status-transition が知っている。文言を二重に持たない。

        **「キャンセルを選んでください」と付け足さない。** 欠席からは
        キャンセルへ移せないので、できないことを勧めることになる。
        移せる先は reason が並べている。
      */
      throw ApiError.validation(
        transition.reason ?? 'この参加状態には変更できません'
      )
    }

    /*
      参加できる人かは、席を取りうる状態へ移るときだけ見る。
      **キャンセルは止めない** — 登録したあとに主催者が参加できる人を絞っても、
      本人が降りることはできる。
    */
    if (becomingActive) {
      assertEligible(event, session.user)
    }

    // トランザクションで参加状態とオプション選択を更新
    const updatedParticipation = await prisma.$transaction(async (tx) => {
      // 満員チェック（参加に変更する場合のみ。参加リクエストと未定は席を取らない）
      if (status === 'attending') {
        await assertSeatAvailable(tx, id, session.user.id)
      }

      const updateData = {
        status,
        comment: comment || null,
        cancellationReason: status === 'cancelled' ? 'user_cancelled' : null,
        // 同意の記録は上書きしない。一度同意していれば残す
        ...(event.terms && becomingActive && termsAccepted && !participation.termsAccepted
          ? { termsAccepted: true, termsAcceptedAt: new Date() }
          : {}),
      }

      // 参加記録を更新
      const updated = await tx.eventParticipant.update({
        where: {
          eventId_userId: {
            eventId: id,
            userId: session.user.id,
          },
        },
        data: updateData,
      })

      // 消す前に、いま選んでいる選択肢を控える（定員を減らされても選んでいた人は外さない）
      const kept = becomingActive
        ? await tx.participantGroupOption.findMany({
            where: { selection: { participantId: updated.id } },
            select: { optionId: true },
          })
        : []

      // 既存のグループ選択を削除
      await tx.participantGroupSelection.deleteMany({
        where: { participantId: updated.id },
      })

      // オプション・アンケートの回答を保存（自由入力もここを通る）
      if (becomingActive) {
        const answers = { selectedGroupOptions, groupTextAnswers }
        await assertOptionSeatsAvailable(tx, {
          eventId: id,
          userId: session.user.id,
          status,
          groups: event.optionGroups,
          chosenOptionIds: resolveGroupSelections(event.optionGroups, answers).flatMap((w) => w.optionIds),
          kept: new Set(kept.map((k) => k.optionId)),
        })
        await writeGroupSelections(tx, updated.id, event.optionGroups, answers)
      }

      return updated
    })

    // 詳細情報と一緒に返す
    const participationWithDetails = await prisma.eventParticipant.findUnique({
      where: { id: updatedParticipation.id },
      include: PARTICIPATION_DETAIL_INCLUDE,
    })

    notifyAfter('participate.update', () =>
      notifyParticipationChanged(
        { id: event.id, title: event.title },
        session.user.id,
        status as ParticipantStatus
      )
    )

    return participationWithDetails
  },
})
