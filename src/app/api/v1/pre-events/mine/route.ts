import type { Prisma } from '@/generated/prisma/client'

import { prisma } from '@/lib/prisma'
import { myPreEventsQuery } from '@/schemas/pre-event'
import { defineRoute } from '@/server/http/define-route'
import { makeMeta, okList } from '@/server/http/response'
import { PRE_EVENT_LIST_SELECT } from '@/server/queries/pre-event-list'
import { serializePreEventListItem } from '@/server/serializers/pre-event'

/**
 * 自分に紐づく日程調整の一覧（`/dashboard/my-pre-events`）。
 *
 * **公開条件（`PUBLIC_PRE_EVENT_CONDITIONS`）を掛けない。** 一覧画面と違い、
 * ここは自分のものを並べる場所なので、非公開のものもハイライト対象で
 * ないものも自分には見えなければならない。見える範囲を決めているのは
 * 「自分が主催しているか、回答したか」の条件そのもの。
 */
export const GET = defineRoute({
  auth: 'required',
  query: myPreEventsQuery,
  handler: async ({ query, session }) => {
    const userId = session.user.id
    const now = new Date()
    const past = query.scope === 'past'

    /*
      主催している日程調整。**作成者だけではない。**
      グループのものは作成者が誰であれ、そのグループの管理者にとって
      自分のもの（イベント側の `mine` と同じ条件）。
    */
    const createdCondition: Prisma.PreEventWhereInput = {
      OR: [{ creatorId: userId }, { organization: { admins: { some: { userId } } } }],
    }

    /** 回答したもの。回答の行は「候補日 × 人」だが、`some` なら1つあれば足りる */
    const participatingCondition: Prisma.PreEventWhereInput = {
      participants: { some: { userId } },
    }

    const mine: Prisma.PreEventWhereInput =
      query.role === 'created'
        ? createdCondition
        : query.role === 'participating'
          ? participatingCondition
          : { OR: [createdCondition, participatingCondition] }

    /*
      **終わったかどうかは候補日で決める。** 日程調整に開催日は無い。
      未来の候補日が1つでも残っていればこれから、1つも無ければ終了
      （`/api/v1/pre-events/sections` と同じ判定）。
      **イベントにしたものは終わった側。** 日程調整としての役目は済んでいる。
    */
    const upcoming: Prisma.PreEventWhereInput = {
      promotedAt: null,
      dateOptions: { some: { startDate: { gte: now } } },
    }
    const scoped: Prisma.PreEventWhereInput = past ? { NOT: upcoming } : upcoming

    const where: Prisma.PreEventWhereInput = {
      // 管理者が無効にしたものは自分のものでも出さない
      AND: [{ isDisabled: false }, mine, scoped],
    }

    const [preEvents, total] = await Promise.all([
      prisma.preEvent.findMany({
        where,
        select: PRE_EVENT_LIST_SELECT,
        /*
          並びは作成の新しい順。**候補日では並べられない**（1件が複数の
          日付を持つので、DB 側に「その日程調整の日付」という1列が無い）。
        */
        orderBy: { createdAt: 'desc' },
        take: query.perPage,
        skip: (query.page - 1) * query.perPage,
      }),
      prisma.preEvent.count({ where }),
    ])

    return okList(
      preEvents.map(serializePreEventListItem),
      makeMeta(total, query.page, query.perPage)
    )
  },
})
