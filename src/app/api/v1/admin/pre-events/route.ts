import { Prisma } from '@/generated/prisma/client'

import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { makeMeta, okList } from '@/server/http/response'
import { creatorSearchWhere, insensitive } from '@/server/queries/admin-search'
import { serializeUser, type PublicUserDto } from '@/server/serializers/user'
import { adminPreEventsQuery } from '@/schemas/admin'

/** 管理画面の日程調整一覧の1行。イベント側（`AdminEventDto`）と同じ形に揃える */
export type AdminPreEventDto = {
  id: string
  title: string
  createdAt: string
  isPublic: boolean
  isDisabled: boolean
  creator: PublicUserDto
  organization: { id: string; name: string; slug: string } | null
  /** 回答した人数（候補日の数ではない） */
  participantCount: number
}

export const GET = defineRoute({
  auth: 'admin',
  query: adminPreEventsQuery,
  handler: async ({ query }) => {
    const conditions: Prisma.PreEventWhereInput[] = []

    if (query.search) {
      conditions.push({
        OR: [{ title: insensitive(query.search) }, { creator: creatorSearchWhere(query.search) }],
      })
    }

    switch (query.status) {
      case 'public':
        conditions.push({ isPublic: true, isDisabled: false })
        break
      case 'private':
        conditions.push({ isPublic: false, isDisabled: false })
        break
      case 'disabled':
        conditions.push({ isDisabled: true })
        break
    }

    if (query.creatorId) conditions.push({ creatorId: query.creatorId })

    const where: Prisma.PreEventWhereInput = conditions.length ? { AND: conditions } : {}

    const [preEvents, total] = await Promise.all([
      prisma.preEvent.findMany({
        where,
        select: {
          id: true,
          title: true,
          createdAt: true,
          isPublic: true,
          isDisabled: true,
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
              server: true,
              platform: true,
            },
          },
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.preEvent.count({ where }),
    ])

    // PreEventParticipant は「1ユーザー × 候補日程数」の行を持つため、
    // 単純な _count では回答者数にならない。ユーザー単位で数える。
    // 一覧の件数ぶん groupBy 1回で済ませる（従来は件数ぶんクエリを投げていた）。
    const counts = await prisma.preEventParticipant.groupBy({
      by: ['preEventId', 'userId'],
      where: { preEventId: { in: preEvents.map((pe) => pe.id) } },
    })
    const participantCounts = counts.reduce<Record<string, number>>((acc, row) => {
      acc[row.preEventId] = (acc[row.preEventId] ?? 0) + 1
      return acc
    }, {})

    const items: AdminPreEventDto[] = preEvents.map((pe) => ({
      id: pe.id,
      title: pe.title,
      createdAt: pe.createdAt.toISOString(),
      isPublic: pe.isPublic,
      isDisabled: pe.isDisabled,
      creator: serializeUser(pe.creator),
      organization: pe.organization,
      participantCount: participantCounts[pe.id] ?? 0,
    }))

    return okList(items, makeMeta(total, query.page, query.perPage))
  },
})
