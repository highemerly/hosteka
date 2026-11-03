import { Prisma } from '@/generated/prisma/client'

import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { makeMeta, okList } from '@/server/http/response'
import { userSearchWhere } from '@/server/queries/admin-search'
import { serializeUser, type PublicUserDto } from '@/server/serializers/user'
import { adminUsersQuery } from '@/schemas/admin'

/**
 * 管理画面のユーザー一覧の1行。
 *
 * **公開 DTO（`PublicUserDto`）に調査用の値を足したもの。** IP・最終ログイン・
 * 規約の同意日時は、ここ（`auth: 'admin'`）以外から出してはならない
 * （`FORBIDDEN_USER_FIELDS`）。
 */
export type AdminUserListItemDto = PublicUserDto & {
  isAdmin: boolean
  createdAt: string
  lastLoginAt: string | null
  lastTermsAcceptedAt: string | null
  /** 新しい順。保存は JSON 文字列なので、ここで配列に直す */
  ipAddresses: string[]
  /** BAN（停止）された日時。停止されていなければ null */
  bannedAt: string | null
  counts: {
    /** 主催したもの。BAN するとこれらは無効化される（消えはしない） */
    events: number
    preEvents: number
    orgs: number
    /** 参加したもの */
    eventParticipations: number
    preEventResponses: number
  }
}

function parseIpAddresses(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export const GET = defineRoute({
  auth: 'admin',
  query: adminUsersQuery,
  handler: async ({ query }) => {
    const where: Prisma.UserWhereInput = query.search ? userSearchWhere(query.search) : {}

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          server: true,
          platform: true,
          // 管理画面の調査用途で必要なため、この画面に限って返す
          lastTermsAcceptedAt: true,
          lastLoginAt: true,
          ipAddresses: true,
          createdAt: true,
          isAdmin: true,
          ban: { select: { bannedAt: true } },
          _count: {
            select: {
              events: true,
              preEvents: true,
              createdOrganizations: true,
              participants: true,
            },
          },
        },
        // 最終ログインが無い行（null）は、どちらの向きでも末尾へ置く
        orderBy:
          query.sortBy === 'lastLoginAt'
            ? { lastLoginAt: { sort: query.sortOrder, nulls: 'last' } }
            : { createdAt: query.sortOrder },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.user.count({ where }),
    ])

    // PreEventParticipant は「1ユーザー × 候補日程数」の行を持つため、
    // 参加した日程調整の数はユーザー単位で数える必要がある。
    const preEventRows = await prisma.preEventParticipant.groupBy({
      by: ['userId', 'preEventId'],
      where: { userId: { in: users.map((u) => u.id) } },
    })
    const preEventCounts = preEventRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.userId] = (acc[row.userId] ?? 0) + 1
      return acc
    }, {})

    const items: AdminUserListItemDto[] = users.map((user) => ({
      ...serializeUser(user),
      isAdmin: user.isAdmin,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      lastTermsAcceptedAt: user.lastTermsAcceptedAt?.toISOString() ?? null,
      ipAddresses: parseIpAddresses(user.ipAddresses),
      bannedAt: user.ban?.bannedAt.toISOString() ?? null,
      counts: {
        events: user._count.events,
        preEvents: user._count.preEvents,
        orgs: user._count.createdOrganizations,
        eventParticipations: user._count.participants,
        preEventResponses: preEventCounts[user.id] ?? 0,
      },
    }))

    return okList(items, makeMeta(total, query.page, query.perPage))
  },
})
