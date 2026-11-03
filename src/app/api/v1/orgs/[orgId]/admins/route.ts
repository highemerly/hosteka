import { prisma } from '@/lib/prisma'
import { normalizeUsername, normalizeServer } from '@/lib/normalize'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { created } from '@/server/http/response'
import { loadOrgBySlug, requireOrgAdminRole } from '@/server/http/guards'
import { serializeUser } from '@/server/serializers/user'
import { addOrgAdminBody, orgIdParam } from '@/schemas/org'
import { notifyAfter, notifyOrgAdminAdded } from '@/server/notifications/notify'

const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  server: true,
  platform: true,
} as const

/** グループに管理者を追加する。追加後の一覧を返す */
export const POST = defineRoute({
  auth: 'required',
  params: orgIdParam,
  body: addOrgAdminBody,
  guard: requireOrgAdminRole('管理者の追加'),
  handler: async ({ params, body, session }) => {
    const org = await loadOrgBySlug(params.orgId)

    const user = await prisma.user.findUnique({
      where: {
        username_server: {
          username: normalizeUsername(body.username),
          server: normalizeServer(body.server),
        },
      },
      select: { id: true },
    })
    if (!user) {
      throw ApiError.notFound(
        'ユーザーが見つかりません。このサービスにログイン済みのユーザーのみ追加できます'
      )
    }

    const existing = await prisma.organizationAdmin.findUnique({
      where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      select: { id: true },
    })
    if (existing) throw ApiError.conflict('このユーザーは既に管理者です')

    await prisma.organizationAdmin.create({
      data: { organizationId: org.id, userId: user.id, role: body.role },
    })

    const admins = await prisma.organizationAdmin.findMany({
      where: { organizationId: org.id },
      include: { user: { select: PUBLIC_USER_SELECT } },
    })

    notifyAfter('org.admin-added', () => notifyOrgAdminAdded(org, user.id, session.user.id))

    return created(
      admins.map((a) => ({ id: a.id, role: a.role, user: serializeUser(a.user) }))
    )
  },
})
