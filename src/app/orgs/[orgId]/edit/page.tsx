import type { Metadata } from 'next'

import OrgFormScreen from '@/screens/orgs/OrgFormScreen'

/**
 * グループの編集。
 *
 * **権限の判定は API が行う**（`requireOrgAdminRole`）。このページは
 * セッションを見ない。
 */
export const metadata: Metadata = {
  title: 'グループを編集 - Hosteka',
  robots: { index: false },
}

type Props = { params: Promise<{ orgId: string }> }

export default async function EditOrgPage({ params }: Props) {
  const { orgId } = await params
  return (
    <OrgFormScreen slug={orgId} />
  )
}
