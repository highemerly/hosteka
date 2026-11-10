import { prisma } from '@/lib/prisma'
import { extractServerNamesFromAllowedServers } from '@/lib/participation-utils'
import {
  promotionCapacityError,
  promotionMismatches,
  selectAutoRegistrants,
  type PromotionSource,
} from '@/lib/pre-event-promotion'
import { preEventIdParam, promotePreEventBody } from '@/schemas/pre-event'
import { insertEvent, prepareEvent } from '@/server/events/create-event'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { requirePreEventOwner } from '@/server/http/guards'
import { created } from '@/server/http/response'
import { notifyAfter, notifyPreEventPromoted } from '@/server/notifications/notify'
import { assertNotPromoted } from '@/server/pre-events/promotion'

/** 項目の名前。食い違いを言うときに使う */
const FIELD_LABEL: Record<string, string> = {
  startDate: '開催日',
  startTime: '開始時刻',
  endDate: '終了日',
  endTime: '終了時刻',
  terms: '参加規約',
  organizationId: '主催',
  isAllowedForFediverse: '参加できるプラットフォーム',
  isAllowedForDiscord: '参加できるプラットフォーム',
  isAllowedForTwitter: '参加できるプラットフォーム',
  allowedFediverseServers: '参加できるサーバー',
}

/**
 * 日程調整を、候補日の1つでイベントにする。
 *
 * 1つのトランザクションで、イベントを作る → 自動登録を選んだ人を参加者にする →
 * 日程調整を閉じる。途中で落ちたら全部なかったことにする（イベントだけ
 * できて日程調整が開いたまま、を作らない）。
 *
 * **取り消せない操作なので、削除と同じ人だけ**（作成者と所属グループの
 * 管理責任者。幹事とスタッフは通さない）。
 */
export const POST = defineRoute({
  auth: 'required',
  params: preEventIdParam,
  body: promotePreEventBody,
  guard: requirePreEventOwner('イベント化'),
  handler: async ({ params, body, session }) => {
    const preEvent = await prisma.preEvent.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        creatorId: true,
        organizationId: true,
        terms: true,
        isAllowedForFediverse: true,
        isAllowedForDiscord: true,
        isAllowedForTwitter: true,
        allowedFediverseServers: true,
        promotedAt: true,
        dateOptions: { select: { id: true, startDate: true, endDate: true } },
        participants: {
          select: {
            userId: true,
            dateOptionId: true,
            status: true,
            autoRegisterWhenPromoted: true,
            termsAcceptedAt: true,
            user: { select: { platform: true, server: true } },
          },
        },
      },
    })
    if (!preEvent) throw ApiError.notFound('日程調整が見つかりません')
    assertNotPromoted(preEvent)

    const option = preEvent.dateOptions.find((o) => o.id === body.dateOptionId)
    if (!option) throw ApiError.validation('候補日が見つかりません')

    const source: PromotionSource = {
      terms: preEvent.terms,
      organizationId: preEvent.organizationId,
      isAllowedForFediverse: preEvent.isAllowedForFediverse,
      isAllowedForDiscord: preEvent.isAllowedForDiscord,
      isAllowedForTwitter: preEvent.isAllowedForTwitter,
      allowedServers: preEvent.allowedFediverseServers
        ? extractServerNamesFromAllowedServers(JSON.parse(preEvent.allowedFediverseServers))
        : [],
    }

    /*
      **書き換えずに断る。** 食い違う値を黙って日程調整の値で上書きすると、
      画面に出ていたものと違うイベントができる（保存した顔をして別の値が残る）。
      画面は同じ関数で欄を固定しているので、ここに来るのは API を直に叩いたときだけ。
    */
    const mismatches = promotionMismatches(body.event, source, option)
    if (mismatches.length > 0) {
      throw ApiError.validation(
        '日程調整と違う値ではイベントにできません',
        mismatches.map((field) => ({
          path: `event.${field}`,
          message: `${FIELD_LABEL[field]}は日程調整と同じにしてください`,
        }))
      )
    }

    const registrants = selectAutoRegistrants(preEvent.participants, {
      dateOptionId: option.id,
      creatorId: preEvent.creatorId,
      source,
    })
    const capacityError = promotionCapacityError(body.event.maxParticipants, registrants.length)
    if (capacityError) {
      throw ApiError.validation(capacityError, [
        { path: 'event.maxParticipants', message: capacityError },
      ])
    }

    const prepared = await prepareEvent(body.event, session.user.id)
    const now = new Date()

    const event = await prisma.$transaction(async (tx) => {
      // 作成者は日程調整の作成者。グループの管理者がイベントにしても、持ち主は変えない
      const createdEvent = await insertEvent(tx, prepared, preEvent.creatorId)

      /*
        **閉じるのは条件付きの更新で。** 二重送信で2本が同時に来ても、
        2本目はこの行のロックを待ったあと `promotedAt: null` に合わなくなり、
        0件で戻る → 投げてイベントごと巻き戻す。
      */
      const closed = await tx.preEvent.updateMany({
        where: { id: preEvent.id, promotedAt: null },
        data: {
          promotedAt: now,
          promotedEventId: createdEvent.id,
          promotedDateOptionId: option.id,
        },
      })
      if (closed.count === 0) {
        throw ApiError.conflict('この日程調整はイベントになったため、変更できません')
      }

      if (registrants.length > 0) {
        await tx.eventParticipant.createMany({
          data: registrants.map((r) => ({
            eventId: createdEvent.id,
            userId: r.userId,
            status: 'attending',
            // 日程調整の規約への同意を引き継ぐ。規約はイベントへそのまま写している
            termsAccepted: true,
            termsAcceptedAt: preEvent.terms ? r.termsAcceptedAt : null,
          })),
        })
      }

      return createdEvent
    })

    notifyAfter('pre-event.promote', () =>
      notifyPreEventPromoted(
        { id: preEvent.id },
        { id: event.id, title: body.event.title },
        registrants.map((r) => r.userId),
        session.user.id
      )
    )

    return created({ id: event.id, registeredCount: registrants.length })
  },
})
