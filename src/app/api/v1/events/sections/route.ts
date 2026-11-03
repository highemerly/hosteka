import { defineRoute } from '@/server/http/define-route'
import { prisma } from '@/lib/prisma'
import {
  endedCondition,
  EVENT_LIST_SELECT,
  PUBLIC_EVENT_CONDITIONS,
} from '@/server/queries/event-list'
import { serializeEventListItem, type EventListItemDto } from '@/server/serializers/event'
import type { Prisma } from '@/generated/prisma/client'

/**
 * イベント一覧の各セクションを**1往復で**返す。
 *
 * 旧一覧は `/api/v1/events` を条件を変えて逐次で叩いていた（イベントと
 * 日程調整を合わせて10本）。往復のたびにモバイルの RTT が積み上がり、
 * 体感の遅さの主因になっていた。セクションはどれも同じ「公開・表示対象」の
 * 母集合から取るので、サーバー側で並列に引いてまとめて返す。
 *
 * **`/api/v1/events` は置き換えない。** ダッシュボードや管理画面が
 * 汎用の絞り込みとして使っている。こちらは一覧画面専用の読み取り口。
 */


/** 1セクションの件数 */
const SECTION_SIZE = 12

const FEDIVERSE_PLATFORMS = ['mastodon', 'misskey', 'pleroma']

/**
 * 「参加登録している」とみなす状態。
 * **cancelled と not_attending は含めない。** キャンセルした人にとって
 * そのイベントは再び「まだ登録していないイベント」なので、一覧から
 * 消してしまうと戻る道がなくなる。
 */
const ACTIVE_PARTICIPATION = ['attending', 'maybe', 'participation_request']

export type EventSectionsDto = {
  featured: EventListItemDto[]
  deadlineSoon: EventListItemDto[]
  latest: EventListItemDto[]
  /** Fediverse ユーザーにだけ出す。それ以外は null */
  myServer: { server: string; items: EventListItemDto[] } | null
}

export const GET = defineRoute({
  auth: 'optional',
  handler: async ({ session }) => {
    const userId = session?.user.id
    const userServer = session?.user.server
    const userPlatform = session?.user.platform
    const now = new Date()

    /*
      母集合。公開・表示対象・無効化されていない・中止されていない・
      終わっていないもの。ここを1か所にまとめておかないと、
      セクションごとに見える範囲が変わる。

      **絞り込みはこれだけ。** この画面は「まだ参加登録していない
      イベントを見つける」ためのもので、利用者に条件を選ばせない。
      選べるフィルタを足すと、既定でどれが効いているのかを
      毎回確かめさせることになる。
    */
    const base: Prisma.EventWhereInput[] = [
      ...PUBLIC_EVENT_CONDITIONS,
      { status: { not: 'cancelled' } },
      endedCondition(false, now),
    ]

    // 既に登録しているものは出さない。未ログインなら外すものがない
    if (userId) {
      base.push({
        NOT: { participants: { some: { userId, status: { in: ACTIVE_PARTICIPATION } } } },
      })
    }

    const where = (extra: Prisma.EventWhereInput[] = []): Prisma.EventWhereInput => ({
      AND: [...base, ...extra],
    })

    const weekFromNow = new Date(now.getTime() + 7 * 86_400_000)
    const isFediverseUser = Boolean(userServer) && FEDIVERSE_PLATFORMS.includes(userPlatform ?? '')

    const [featured, deadlineSoon, latest, myServer] = await Promise.all([
      prisma.event.findMany({
        where: where(),
        select: EVENT_LIST_SELECT,
        // 人が集まっているものを上に。並びは決め打ちにしてキャッシュ可能に保つ
        orderBy: [{ participants: { _count: 'desc' } }, { startDate: 'asc' }],
        take: SECTION_SIZE,
      }),
      prisma.event.findMany({
        where: where([
          { registrationDeadlineDate: { gte: now, lte: weekFromNow } },
        ]),
        select: EVENT_LIST_SELECT,
        orderBy: { registrationDeadlineDate: 'asc' },
        take: SECTION_SIZE,
      }),
      prisma.event.findMany({
        where: where(),
        select: EVENT_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        take: SECTION_SIZE,
      }),
      isFediverseUser
        ? prisma.event.findMany({
            where: where([{ creator: { server: userServer } }]),
            select: EVENT_LIST_SELECT,
            orderBy: { startDate: 'asc' },
            take: SECTION_SIZE,
          })
        : Promise.resolve(null),
    ])

    // ハンドラは素のデータを返す。エンベロープは defineRoute が付ける
    const dto: EventSectionsDto = {
      featured: featured.map(serializeEventListItem),
      deadlineSoon: deadlineSoon.map(serializeEventListItem),
      latest: latest.map(serializeEventListItem),
      myServer:
        myServer && userServer
          ? { server: userServer, items: myServer.map(serializeEventListItem) }
          : null,
    }

    return dto
  },
})
