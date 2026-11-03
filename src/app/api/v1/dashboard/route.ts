import type { Prisma } from '@/generated/prisma/client'

import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { endedCondition, EVENT_LIST_SELECT } from '@/server/queries/event-list'
import { PRE_EVENT_LIST_SELECT } from '@/server/queries/pre-event-list'
import { serializeEventListItem, type EventListItemDto } from '@/server/serializers/event'
import {
  serializePreEventListItem,
  type PreEventListItemDto,
} from '@/server/serializers/pre-event'

/**
 * マイページの中身。**1往復で全部返す。**
 *
 * 旧マイページは `page.tsx` が `getSession()` を呼んで prisma を9本叩き、
 * さらにカレンダーが別途 `/api/v1/events` を週ごとに叩いていた。
 * ページを静的にするために、取得はすべてここへ寄せる。
 *
 * **公開キャッシュに載せない**（`auth: 'required'` なので型でも付けられない）。
 * 応答は閲覧者ごとに違う。
 */

/**
 * 「開催が近いイベント」に出す件数。
 *
 * **2件。広い画面では横に2枚並べ、狭い画面では2件目を隠す。**
 * 件数を画面幅で変えるので、読む件数は広いほうに合わせる
 * （狭い画面のために往復を分けると、幅が変わるたびに取り直しになる）。
 * 3件目以降はすぐ下の「すべてみる」＝`/dashboard/my-events` が受け持つ。
 */
const UPCOMING_LIMIT = 2

/** 「最近回答した日程調整」に出す件数。イベント側と揃えて2件 */
const RECENT_PRE_EVENT_LIMIT = 2

export type DashboardDto = {
  account: {
    id: string
    displayName: string
    username: string
    server: string
    platform: string
    avatar: string | null
    /**
     * 投稿の権限を持つトークンか。**`null` は「分からない」**
     * （この列より前に入ったユーザー）。`false` で埋めると、
     * 権限を持っている人まで入り直しを強いることになる。
     */
    hasWritePermission: boolean | null
  }
  /** 開催日が近い順。主催・参加をまとめて出す */
  upcoming: EventListItemDto[]
  /**
   * 自分が回答した日程調整。**開催日の順ではなく、回答した順。**
   * 日程調整には開催日が無く、動くのは「まだ決まっていない話」のほうなので、
   * 最後に触ったものから並べる。
   */
  recentPreEvents: PreEventListItemDto[]
}

export const GET = defineRoute({
  auth: 'required',
  handler: async ({ session }): Promise<DashboardDto> => {
    const userId = session.user.id
    const now = new Date()

    /*
      主催しているイベント。**作成者だけではない。**
      グループのイベントは作成者が誰であれ、そのグループの管理者にとって
      自分のイベント（`/api/v1/events/mine` と同じ条件）。
    */
    const created: Prisma.EventWhereInput = {
      OR: [{ creatorId: userId }, { organization: { admins: { some: { userId } } } }],
    }

    /*
      参加しているイベント。**「参加」と「未定」だけ**を自分の予定として数える。
      欠席・キャンセルまで数えると「今後の予定が3件」と言いながら
      行かないイベントが混じる。
    */
    const participating: Prisma.EventWhereInput = {
      participants: { some: { userId, status: { in: ['attending', 'maybe'] } } },
    }

    /*
      これから開催されるもの。**判定は一覧と同じ `endedCondition`。**
      旧マイページはここだけ「終了から48時間」の猶予を持っており、
      数字と `/dashboard/my-events` の件数が食い違っていた。
    */
    const upcomingEvent: Prisma.EventWhereInput[] = [
      { isDisabled: false },
      endedCondition(false, now),
    ]

    /*
      自分が回答した日程調整を、**最後に回答した順**に数件。

      回答の行は「候補日 × 人」で増えるので、行をそのまま並べても
      同じ日程調整ばかりになる。日程調整ごとにまとめてから並べる。

      並びの基準は `createdAt`。回答の作り直し（`participate` は
      deleteMany + createMany で保存する）で入り直るので、
      **「最後に回答した時刻」そのもの**になる。`updatedAt` は
      主催者が候補日を編集したときにも動くので使わない。
    */
    const recentPreEvents = (async () => {
      const answered = await prisma.preEventParticipant.groupBy({
        by: ['preEventId'],
        where: { userId },
        _max: { createdAt: true },
        orderBy: { _max: { createdAt: 'desc' } },
        take: RECENT_PRE_EVENT_LIMIT,
      })
      const ids = answered.map((a) => a.preEventId)
      if (ids.length === 0) return []

      const rows = await prisma.preEvent.findMany({
        where: { id: { in: ids }, isDisabled: false },
        select: PRE_EVENT_LIST_SELECT,
      })
      // `in` で取ると DB の都合の順で返る。回答の新しい順に並べ直す
      const byId = new Map(rows.map((row) => [row.id, row]))
      return ids.flatMap((id) => {
        const row = byId.get(id)
        return row ? [serializePreEventListItem(row)] : []
      })
    })()

    const [account, upcoming, recent] = await Promise.all([
      /*
        アカウントの情報。**`USER_PUBLIC_SELECT` に createdAt を足した形で取る。**
        `select` を書かずに1行取ると accessToken や ipAddresses まで載る
        （CLAUDE.md「Security」）。
      */
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          server: true,
          platform: true,
          hasWritePermission: true,
        },
      }),

      /*
        開催が近いイベント。**主催と参加をまとめて、近い順に数件だけ。**
        中止したものは出さない（一覧では消さないが、ここは「次に何があるか」
        を見る場所なので、行かない予定で埋まると用を成さない）。
      */
      prisma.event.findMany({
        where: {
          AND: [...upcomingEvent, { status: { not: 'cancelled' } }, { OR: [created, participating] }],
        },
        select: EVENT_LIST_SELECT,
        orderBy: { startDate: 'asc' },
        take: UPCOMING_LIMIT,
      }),

      recentPreEvents,
    ])

    /*
      セッションはあるのに行が無い＝退会直後などの取り残し。
      **500 にしない。** 401 を返せば画面がログインへ案内でき、
      利用者は入り直すだけで抜けられる。
    */
    if (!account) throw ApiError.unauthenticated()

    return {
      account: {
        id: account.id,
        displayName: account.displayName,
        username: account.username,
        server: account.server,
        platform: account.platform,
        avatar: account.avatar,
        hasWritePermission: account.hasWritePermission,
      },
      upcoming: upcoming.map(serializeEventListItem),
      recentPreEvents: recent,
    }
  },
})
