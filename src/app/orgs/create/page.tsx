import type { Metadata } from 'next'

import OrgFormScreen from '@/screens/orgs/OrgFormScreen'

/**
 * グループの作成。
 *
 * **このページはセッションもデータも取得しない。** 未ログインの扱いは
 * API が決める（保存時に401が返る）。
 */
export const metadata: Metadata = {
  title: 'グループを作成 - Hosteka',
  robots: { index: false },
}

export default function CreateOrgPage() {
  return (
    <OrgFormScreen />
  )
}
