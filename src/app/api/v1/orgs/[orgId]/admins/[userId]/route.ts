import { prisma } from '@/lib/prisma'
import { canChangeOrgAdminRole, canRemoveOrgAdmin } from '@/lib/status-transition'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { loadOrgBySlug } from '@/server/http/guards'
import { serializeUser } from '@/server/serializers/user'
import { changeOrgAdminRoleBody, orgAdminParam } from '@/schemas/org'
import { checkOrgAdminRolePermission } from '@/lib/permissions'

const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  server: true,
  platform: true,
} as const

/**
 * 遷移可否の判定は lib/status-transition.ts に寄せる。
 * 「自分自身は変更できない」「作成者は変更できない」といった規則は
 * あちらにユニットテスト付きで実装済みなのに、これまで本番から一度も
 * 呼ばれておらず、各ルートで同じ規則が書き直されていた。
 */
async function loadContext(orgSlug: string, actorId: string) {
  const org = await loadOrgBySlug(orgSlug)
  const isActorAdmin = await checkOrgAdminRolePermission(org.id, actorId)
  return { org, isActorAdmin }
}

export const PATCH = defineRoute({
  auth: 'required',
  params: orgAdminParam,
  body: changeOrgAdminRoleBody,
  handler: async ({ params, body, session }) => {
    const { org, isActorAdmin } = await loadContext(params.orgId, session.user.id)

    const decision = canChangeOrgAdminRole(
      params.userId,
      session.user.id,
      org.creatorId ?? '',
      isActorAdmin
    )
    if (!decision.allowed) {
      // 権限不足は403、それ以外（自分自身・作成者）は操作として不正なので400
      throw isActorAdmin
        ? ApiError.validation(decision.reason ?? 'この役割は変更できません')
        : ApiError.forbidden('役割の変更は管理者のみ可能です')
    }

    const record = await prisma.organizationAdmin.findUnique({
      where: { organizationId_userId: { organizationId: org.id, userId: params.userId } },
      select: { id: true },
    })
    if (!record) throw ApiError.notFound('指定されたユーザーは管理者ではありません')

    const updated = await prisma.organizationAdmin.update({
      where: { id: record.id },
      data: { role: body.role },
      include: { user: { select: PUBLIC_USER_SELECT } },
    })

    return { id: updated.id, role: updated.role, user: serializeUser(updated.user) }
  },
})

export const DELETE = defineRoute({
  auth: 'required',
  params: orgAdminParam,
  handler: async ({ params, session }) => {
    const { org, isActorAdmin } = await loadContext(params.orgId, session.user.id)

    const decision = canRemoveOrgAdmin(
      params.userId,
      session.user.id,
      org.creatorId ?? '',
      isActorAdmin
    )
    if (!decision.allowed) {
      throw isActorAdmin
        ? ApiError.validation(decision.reason ?? 'この管理者は削除できません')
        : ApiError.forbidden('管理者の削除は管理者のみ可能です')
    }

    const record = await prisma.organizationAdmin.findUnique({
      where: { organizationId_userId: { organizationId: org.id, userId: params.userId } },
      select: { id: true },
    })
    if (!record) throw ApiError.notFound('指定されたユーザーは管理者ではありません')

    await prisma.organizationAdmin.delete({ where: { id: record.id } })
    return { success: true }
  },
})
