import { defineRoute } from '@/server/http/define-route'
import { prisma } from '@/lib/prisma'
import {
  PRE_EVENT_LIST_SELECT,
  PUBLIC_PRE_EVENT_CONDITIONS,
} from '@/server/queries/pre-event-list'
import {
  serializePreEventListItem,
  type PreEventListItemDto,
} from '@/server/serializers/pre-event'
import type { Prisma } from '@/generated/prisma/client'

/**
 * 日程調整一覧の各セクションを**1往復で**返す。
 * イベント側（`/api/v1/events/sections`）と同じ考え方。
 *
 * **「回答が集まっている」セクションは作らない。** 参加者の行は
 * 「日程 × 人」で増えるため、候補日を多く並べただけの日程調整が
 * 上位に来てしまう。実人数で並べ替えるには全行を読む必要があり、
 * 一覧の1クエリでやることではない。
 */

/** 1セクションの件数 */
const SECTION_SIZE = 12

const FEDIVERSE_PLATFORMS = ['mastodon', 'misskey', 'pleroma']

export type PreEventSectionsDto = {
  deadlineSoon: PreEventListItemDto[]
  latest: PreEventListItemDto[]
  /** Fediverse ユーザーにだけ出す。それ以外は null */
  myServer: { server: string; items: PreEventListItemDto[] } | null
}

export const GET = defineRoute({
  auth: 'optional',
  handler: async ({ session }) => {
    const userId = session?.user.id
    const userServer = session?.user.server
    const userPlatform = session?.user.platform
    const now = new Date()

    /*
      母集合。**絞り込みはこれだけ。** 利用者に条件を選ばせない。

      「終わっていない」は**未来の候補日が1つでも残っていること**。
      日程調整には開催日が無いので、候補日の有無で判定する。
    */
    const base: Prisma.PreEventWhereInput[] = [
      ...PUBLIC_PRE_EVENT_CONDITIONS,
      { dateOptions: { some: { startDate: { gte: now } } } },
    ]

    // 既に回答したものは出さない。未ログインなら外すものがない
    if (userId) {
      base.push({ NOT: { participants: { some: { userId } } } })
    }

    const where = (extra: Prisma.PreEventWhereInput[] = []): Prisma.PreEventWhereInput => ({
      AND: [...base, ...extra],
    })

    const weekFromNow = new Date(now.getTime() + 7 * 86_400_000)
    const isFediverseUser = Boolean(userServer) && FEDIVERSE_PLATFORMS.includes(userPlatform ?? '')

    const [deadlineSoon, latest, myServer] = await Promise.all([
      prisma.preEvent.findMany({
        where: where([{ registrationDeadline: { gte: now, lte: weekFromNow } }]),
        select: PRE_EVENT_LIST_SELECT,
        orderBy: { registrationDeadline: 'asc' },
        take: SECTION_SIZE,
      }),
      prisma.preEvent.findMany({
        where: where(),
        select: PRE_EVENT_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        take: SECTION_SIZE,
      }),
      isFediverseUser
        ? prisma.preEvent.findMany({
            where: where([{ creator: { server: userServer } }]),
            select: PRE_EVENT_LIST_SELECT,
            orderBy: { createdAt: 'desc' },
            take: SECTION_SIZE,
          })
        : Promise.resolve(null),
    ])

    // ハンドラは素のデータを返す。エンベロープは defineRoute が付ける
    const dto: PreEventSectionsDto = {
      deadlineSoon: deadlineSoon.map(serializePreEventListItem),
      latest: latest.map(serializePreEventListItem),
      myServer:
        myServer && userServer
          ? { server: userServer, items: myServer.map(serializePreEventListItem) }
          : null,
    }

    return dto
  },
})
