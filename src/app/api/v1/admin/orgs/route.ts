import { Prisma } from '@/generated/prisma/client'

import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { makeMeta, okList } from '@/server/http/response'
import { creatorSearchWhere, insensitive } from '@/server/queries/admin-search'
import { serializeUser, type PublicUserDto } from '@/server/serializers/user'
import { adminOrgsQuery } from '@/schemas/admin'

/** 管理画面のグループ一覧の1行 */
export type AdminOrgDto = {
  id: string
  slug: string
  name: string
  createdAt: string
  /** 作成者が退会・BAN されたグループは null（グループ自体は残る） */
  creator: PublicUserDto | null
  adminCount: number
  eventCount: number
  preEventCount: number
}

const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  server: true,
  platform: true,
} as const

export const GET = defineRoute({
  auth: 'admin',
  query: adminOrgsQuery,
  handler: async ({ query }) => {
    const conditions: Prisma.OrganizationWhereInput[] = []
    if (query.search) {
      conditions.push({
        OR: [
          { name: insensitive(query.search) },
          { slug: insensitive(query.search) },
          { creator: creatorSearchWhere(query.search) },
        ],
      })
    }
    if (query.creatorId) conditions.push({ creatorId: query.creatorId })
    const where: Prisma.OrganizationWhereInput = conditions.length ? { AND: conditions } : {}

    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        select: {
          id: true,
          slug: true,
          name: true,
          createdAt: true,
          creator: { select: PUBLIC_USER_SELECT },
          _count: { select: { admins: true, events: true, preEvents: true } },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.organization.count({ where }),
    ])

    const items: AdminOrgDto[] = orgs.map((org) => ({
      id: org.id,
      slug: org.slug,
      name: org.name,
      createdAt: org.createdAt.toISOString(),
      creator: org.creator ? serializeUser(org.creator) : null,
      adminCount: org._count.admins,
      eventCount: org._count.events,
      preEventCount: org._count.preEvents,
    }))

    return okList(items, makeMeta(total, query.page, query.perPage))
  },
})
