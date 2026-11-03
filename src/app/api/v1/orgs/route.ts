import { prisma } from '@/lib/prisma'
import { generateOrgSlug } from '@/lib/org-id'
import { normalizeUsername, normalizeServer, normalizeSlug } from '@/lib/normalize'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { created } from '@/server/http/response'
import { serializeOrg } from '@/server/serializers/org'
import { createOrgBody } from '@/schemas/org'

const ADMIN_INCLUDE = {
  admins: {
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          server: true,
          platform: true,
        },
      },
    },
  },
} as const

/** ログインユーザーが管理するグループ一覧 */
export const GET = defineRoute({
  auth: 'required',
  handler: async ({ session }) => {
    const orgs = await prisma.organization.findMany({
      where: { admins: { some: { userId: session.user.id } } },
      include: { ...ADMIN_INCLUDE, _count: { select: { events: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return orgs.map(serializeOrg)
  },
})

/** スラッグを決める。指定があれば重複チェック、無ければ衝突するまで再生成 */
async function resolveSlug(requested?: string): Promise<string> {
  if (requested) {
    const normalized = normalizeSlug(requested)
    const existing = await prisma.organization.findUnique({
      where: { slug: normalized },
      select: { id: true },
    })
    if (existing) throw ApiError.conflict('このグループIDは既に使用されています')
    return normalized
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateOrgSlug()
    const existing = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!existing) return candidate
  }
  throw ApiError.internal('グループIDの生成に失敗しました。再度お試しください')
}

export const POST = defineRoute({
  auth: 'required',
  body: createOrgBody,
  handler: async ({ body, session }) => {
    const slug = await resolveSlug(body.slug)

    const org = await prisma.$transaction(async (tx) => {
      const createdOrg = await tx.organization.create({
        data: {
          slug,
          name: body.name,
          description: body.description,
          relatedUrl: body.relatedUrl,
          creatorId: session.user.id,
        },
      })

      // 作成者は必ず admin として登録する
      await tx.organizationAdmin.create({
        data: {
          organizationId: createdOrg.id,
          userId: session.user.id,
          role: 'admin',
        },
      })

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
        // 未登録ユーザーと作成者自身は黙って読み飛ばす（既存の挙動を踏襲）
        if (!user || user.id === session.user.id) continue

        await tx.organizationAdmin.create({
          data: {
            organizationId: createdOrg.id,
            userId: user.id,
            role: admin.role ?? 'staff',
          },
        })
      }

      return tx.organization.findUniqueOrThrow({
        where: { id: createdOrg.id },
        include: ADMIN_INCLUDE,
      })
    })

    return created(serializeOrg(org))
  },
})
