import { prisma } from '@/lib/prisma'
import { normalizeUsername, normalizeServer, normalizeSlug } from '@/lib/normalize'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { loadOrgBySlug, requireOrgAdminRole } from '@/server/http/guards'
import { eventsByOrg, preEventsByOrg } from '@/server/queries/profile-lists'
import { serializeOrg } from '@/server/serializers/org'
import { serializeUser } from '@/server/serializers/user'
import { orgIdParam, updateOrgBody } from '@/schemas/org'

const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  server: true,
  platform: true,
} as const

const ADMIN_INCLUDE = {
  admins: { include: { user: { select: PUBLIC_USER_SELECT } } },
} as const

/**
 * グループ詳細（公開）。
 *
 * **イベントと日程調整の一覧は持たない**（`./events`・`./pre-events` が
 * ページ送りつきで返す）。以前は先頭20件だけを詰めて返していたが、
 * あふれたぶんはイベント一覧へ送るしかなく、送った先でこのグループの
 * ものだけを絞れないので探し直しになっていた。
 *
 * **件数は一覧と同じ条件で数える**（`eventsByOrg` / `preEventsByOrg`）。
 * 以前は `_count` に where が無く、非公開のイベントまで数えていたので、
 * 「32件」と出ているのに20件しか並ばないことがあった。
 */
export const GET = defineRoute({
  auth: 'none',
  params: orgIdParam,
  handler: async ({ params }) => {
    const org = await prisma.organization.findUnique({
      where: { slug: normalizeSlug(params.orgId) },
      include: {
        creator: { select: PUBLIC_USER_SELECT },
        ...ADMIN_INCLUDE,
      },
    })

    if (!org) throw ApiError.notFound('グループが見つかりません')

    const [eventCount, preEventCount, participantCount] = await Promise.all([
      prisma.event.count({ where: eventsByOrg(org.id) }),
      prisma.preEvent.count({ where: preEventsByOrg(org.id) }),
      /*
        のべ参加者数。**キャンセルと不参加は数えない。**
        グループの規模を表す数字なので、席を取っている人だけ数える。
      */
      prisma.eventParticipant.count({
        where: { event: { organizationId: org.id }, status: { in: ['attending', 'maybe'] } },
      }),
    ])

    return {
      ...serializeOrg(org),
      creator: org.creator ? serializeUser(org.creator) : null,
      /*
        **`serializeOrg` の `eventCount` を上書きする。** あちらは `_count`
        （非公開も無効も込み）で、自分のグループ一覧では都合がよいが、
        公開の詳細では下に並ぶ一覧と食い違う。
      */
      eventCount,
      preEventCount,
      participantCount,
    }
  },
})

export const PUT = defineRoute({
  auth: 'required',
  params: orgIdParam,
  body: updateOrgBody,
  guard: requireOrgAdminRole('編集'),
  handler: async ({ params, body }) => {
    const org = await loadOrgBySlug(params.orgId)

    const nextSlug = body.slug ? normalizeSlug(body.slug) : undefined
    if (nextSlug && nextSlug !== org.slug) {
      const existing = await prisma.organization.findUnique({
        where: { slug: nextSlug },
        select: { id: true },
      })
      if (existing) throw ApiError.conflict('このグループIDは既に使用されています')
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: org.id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(nextSlug !== undefined && { slug: nextSlug }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.relatedUrl !== undefined && { relatedUrl: body.relatedUrl }),
        },
      })

      // 作成者は管理者から外せない（グループが管理不能になるため）
      const toRemove = (body.adminsToRemove ?? []).filter((id) => id !== org.creatorId)
      if (toRemove.length > 0) {
        await tx.organizationAdmin.deleteMany({
          where: { organizationId: org.id, userId: { in: toRemove } },
        })
      }

      for (const update of body.adminsToUpdate ?? []) {
        await tx.organizationAdmin.updateMany({
          where: { organizationId: org.id, userId: update.userId },
          data: { role: update.role },
        })
      }

      for (const admin of body.adminsToAdd ?? []) {
        const user = await tx.user.findUnique({
          where: {
            username_server: {
              username: normalizeUsername(admin.username),
              server: normalizeServer(admin.server),
            },
          },
          select: { id: true },
        })
        // 未登録ユーザーは黙って読み飛ばす（既存の挙動を踏襲）
        if (!user) continue

        const existing = await tx.organizationAdmin.findUnique({
          where: {
            organizationId_userId: { organizationId: org.id, userId: user.id },
          },
          select: { id: true },
        })
        if (existing) continue

        await tx.organizationAdmin.create({
          data: {
            organizationId: org.id,
            userId: user.id,
            role: admin.role === 'staff' ? 'staff' : 'admin',
          },
        })
      }

      return tx.organization.findUniqueOrThrow({
        where: { id: org.id },
        include: ADMIN_INCLUDE,
      })
    })

    return serializeOrg(updated)
  },
})

export const DELETE = defineRoute({
  auth: 'required',
  params: orgIdParam,
  guard: requireOrgAdminRole('削除'),
  handler: async ({ params }) => {
    const org = await loadOrgBySlug(params.orgId)
    await prisma.organization.delete({ where: { id: org.id } })
    return { success: true }
  },
})
