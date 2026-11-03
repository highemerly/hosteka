import 'server-only'

import { serializeUser, type PublicUserDto } from './user'

export type OrgAdminDto = {
  id: string
  role: string
  user: PublicUserDto
}

export type OrgDto = {
  id: string
  slug: string
  name: string
  description: string | null
  relatedUrl: string | null
  creatorId: string | null
  createdAt: string
  admins: OrgAdminDto[]
  eventCount?: number
}

type OrgLike = {
  id: string
  slug: string
  name: string
  description: string | null
  relatedUrl: string | null
  creatorId: string | null
  createdAt: Date
  admins?: Array<{
    id: string
    role: string
    user: Parameters<typeof serializeUser>[0]
  }>
  _count?: { events: number }
}

export function serializeOrg(org: OrgLike): OrgDto {
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    description: org.description,
    relatedUrl: org.relatedUrl,
    creatorId: org.creatorId,
    createdAt: org.createdAt.toISOString(),
    admins: (org.admins ?? []).map((a) => ({
      id: a.id,
      role: a.role,
      // ユーザー情報は必ず serializeUser を通す。
      // 直接展開すると accessToken 等が混入しうる。
      user: serializeUser(a.user),
    })),
    ...(org._count ? { eventCount: org._count.events } : {}),
  }
}
