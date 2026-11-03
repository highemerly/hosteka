import { Prisma } from '@/generated/prisma/client'

import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { makeMeta, okList } from '@/server/http/response'
import { creatorSearchWhere, insensitive } from '@/server/queries/admin-search'
import { serializeUser, type PublicUserDto } from '@/server/serializers/user'
import { adminEventsQuery, type VisibilityFilter } from '@/schemas/admin'

/** 管理画面のイベント一覧の1行 */
export type AdminEventDto = {
  id: string
  title: string
  startDate: string
  createdAt: string
  isPublic: boolean
  isDisabled: boolean
  status: 'active' | 'cancelled'
  creator: PublicUserDto
  organization: { id: string; name: string; slug: string } | null
  participantCount: number
}

/** 公開状態のフィルタ条件。日程調整の一覧と同じ語彙 */
function visibilityWhere(status: VisibilityFilter): Prisma.EventWhereInput[] {
  switch (status) {
    case 'public':
      return [{ isPublic: true, isDisabled: false }]
    case 'private':
      return [{ isPublic: false, isDisabled: false }]
    case 'disabled':
      return [{ isDisabled: true }]
    default:
      return []
  }
}

export const GET = defineRoute({
  auth: 'admin',
  query: adminEventsQuery,
  handler: async ({ query }) => {
    const conditions = visibilityWhere(query.status)
    if (query.creatorId) conditions.push({ creatorId: query.creatorId })
    if (query.search) {
      conditions.push({
        OR: [{ title: insensitive(query.search) }, { creator: creatorSearchWhere(query.search) }],
      })
    }
    const where: Prisma.EventWhereInput = conditions.length ? { AND: conditions } : {}

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        select: {
          id: true,
          title: true,
          startDate: true,
          createdAt: true,
          isPublic: true,
          isDisabled: true,
          status: true,
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
          _count: { select: { participants: true } },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.event.count({ where }),
    ])

    const items: AdminEventDto[] = events.map((e) => ({
      id: e.id,
      title: e.title,
      startDate: e.startDate.toISOString(),
      createdAt: e.createdAt.toISOString(),
      isPublic: e.isPublic,
      isDisabled: e.isDisabled,
      status: e.status === 'cancelled' ? 'cancelled' : 'active',
      creator: serializeUser(e.creator),
      organization: e.organization,
      participantCount: e._count.participants,
    }))

    return okList(items, makeMeta(total, query.page, query.perPage))
  },
})
