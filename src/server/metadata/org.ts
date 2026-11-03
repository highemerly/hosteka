import 'server-only'

import type { Metadata } from 'next'

import { prisma } from '@/lib/prisma'
import { normalizeSlug } from '@/lib/normalize'

/**
 * グループのページのメタデータ。
 *
 * 読むのは共有時のタイトルと説明のためで、閲覧者によって変わらない
 * （本文はクライアントが `GET /api/v1/orgs/[orgId]` から取る）。
 */
export async function getOrgMetadata(rawSlug: string): Promise<Metadata> {
  const org = await prisma.organization.findUnique({
    where: { slug: normalizeSlug(rawSlug) },
    select: { name: true, description: true },
  })

  if (!org) return { title: 'グループが見つかりません - Hosteka' }

  return {
    title: `${org.name} - Hosteka`,
    description: org.description?.slice(0, 200) || undefined,
  }
}
