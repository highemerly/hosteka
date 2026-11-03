import type { Metadata } from 'next'

import { getOrgMetadata } from '@/server/metadata/org'
import OrgDetailScreen from '@/screens/orgs/OrgDetailScreen'

type Props = { params: Promise<{ orgId: string }> }

/**
 * グループのページ。
 *
 * **generateMetadata だけがサーバーで動く。** 本文はクライアントが
 * `GET /api/v1/orgs/[orgId]` から取る。
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orgId } = await params
  return getOrgMetadata(orgId)
}

export default async function OrgDetailPage({ params }: Props) {
  const { orgId } = await params
  return (
    <OrgDetailScreen slug={orgId} />
  )
}
