import type { Prisma } from '@/generated/prisma/client'

import { prisma } from '@/lib/prisma'
import { myEventsQuery } from '@/schemas/event'
import { defineRoute } from '@/server/http/define-route'
import { makeMeta, okList } from '@/server/http/response'
import { endedCondition, EVENT_LIST_SELECT } from '@/server/queries/event-list'
import { serializeEventListItem } from '@/server/serializers/event'

/**
 * 自分に紐づくイベントの一覧（`/dashboard/my-events`）。
 *
 * **公開条件（`PUBLIC_EVENT_CONDITIONS`）を掛けない。** 一覧画面と違い、
 * ここは自分のイベントを並べる場所なので、非公開のものも
 * ハイライト対象でないものも自分には見えなければならない。
 * 見える範囲を決めているのは「自分が主催しているか、参加しているか」の
 * 条件そのもの。
 *
 * **`/api/v1/events` は置き換えない。** あちらは旧ダッシュボードと
 * 管理画面が使っている汎用の絞り込みで、Prisma のモデルをそのまま返す。
 * こちらは一覧カード（`EventListItemDto`）に必要なものだけを取る。
 */
export const GET = defineRoute({
  auth: 'required',
  query: myEventsQuery,
  handler: async ({ query, session }) => {
    const userId = session.user.id
    const now = new Date()
    const past = query.scope === 'past'

    /*
      主催しているイベント。**作成者だけではない。**
      グループのイベントは作成者が誰であれ、そのグループの管理者にとって
      自分のイベント。ここを creatorId だけにすると、グループで
      運営している人の一覧から自分のイベントが消える。
    */
    const created: Prisma.EventWhereInput = {
      OR: [{ creatorId: userId }, { organization: { admins: { some: { userId } } } }],
    }

    /*
      参加しているイベント。回答での絞り込みはこちらにだけ掛ける。
      `role=created` のときに掛けると、「主催しているが自分は参加登録して
      いないイベント」が消える。
    */
    const participating: Prisma.EventWhereInput = {
      participants: {
        some: { userId, ...(query.status !== 'all' && { status: query.status }) },
      },
    }

    const mine: Prisma.EventWhereInput =
      query.role === 'created'
        ? created
        : query.role === 'participating'
          ? participating
          : { OR: [created, participating] }

    /*
      **中止したイベントで絞らない。** 自分のものが黙って消えるほうが
      分かりにくいし、一覧のカードが題名の上に「中止」を出すので、
      混ざっていても読み違えない（以前は `includeCancelled` で隠せた）。
    */
    const where: Prisma.EventWhereInput = {
      AND: [
        // 管理者が無効にしたイベントは自分のものでも出さない
        { isDisabled: false },
        mine,
        endedCondition(past, now),
      ],
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        select: EVENT_LIST_SELECT,
        // 開催予定は近い順、終了済みは新しい順。どちらも「今」に近い側から
        orderBy: { startDate: past ? 'desc' : 'asc' },
        take: query.perPage,
        skip: (query.page - 1) * query.perPage,
      }),
      prisma.event.count({ where }),
    ])

    return okList(events.map(serializeEventListItem), makeMeta(total, query.page, query.perPage))
  },
})
