import { Prisma } from '@/generated/prisma/client'

import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { makeMeta, okList } from '@/server/http/response'
import { bannedSearchWhere } from '@/server/queries/admin-search'
import { adminBannedQuery } from '@/schemas/admin'

/**
 * BAN（停止）の1行。
 *
 * **停止された人のアカウントは残っている。** 以前の BAN はユーザーを削除して
 * 名前だけを残す操作だったので、その頃の記録には当人が居らず `displayName`
 * も無い（`null`）。どちらの記録も、再登録を止める判定は `username@server`
 * で行う。
 */
export type BannedUserDto = {
  id: string
  username: string
  server: string
  platform: string
  reason: string | null
  bannedAt: string
  /** 停止された人の表示名。削除方式だった頃の記録では null */
  displayName: string | null
  /** BAN した管理者。その管理者がもう居なければ null */
  bannedBy: { displayName: string; username: string; server: string } | null
}

export const GET = defineRoute({
  auth: 'admin',
  query: adminBannedQuery,
  handler: async ({ query }) => {
    const where: Prisma.BannedUserWhereInput = query.search ? bannedSearchWhere(query.search) : {}

    const [bannedUsers, total] = await Promise.all([
      prisma.bannedUser.findMany({
        where,
        include: { user: { select: { displayName: true } } },
        orderBy: { bannedAt: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.bannedUser.count({ where }),
    ])

    // 誰が BAN したか。ID のままでは読めないので名前へ引く（1回にまとめる）
    const adminIds = [
      ...new Set(bannedUsers.map((b) => b.bannedByAdmin).filter((v): v is string => Boolean(v))),
    ]
    const admins = adminIds.length
      ? await prisma.user.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, displayName: true, username: true, server: true },
        })
      : []
    const adminById = new Map(admins.map((a) => [a.id, a]))

    const items: BannedUserDto[] = bannedUsers.map((b) => {
      const admin = b.bannedByAdmin ? adminById.get(b.bannedByAdmin) : undefined
      return {
        id: b.id,
        username: b.username,
        server: b.server,
        platform: b.platform,
        reason: b.reason,
        bannedAt: b.bannedAt.toISOString(),
        displayName: b.user?.displayName ?? null,
        bannedBy: admin
          ? { displayName: admin.displayName, username: admin.username, server: admin.server }
          : null,
      }
    })

    return okList(items, makeMeta(total, query.page, query.perPage))
  },
})
