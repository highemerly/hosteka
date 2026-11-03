import type { Metadata } from 'next'

import AdminAnnouncementsScreen from '@/screens/admin/AdminAnnouncementsScreen'

/**
 * お知らせの管理。
 *
 * **セッションもデータも取得しない**（CLAUDE.md「レンダリングとキャッシュ」）。管理者かどうかは
 * API が DB で確かめ、入れないときは画面が案内する。
 */
export const metadata: Metadata = {
  title: 'お知らせ - 管理画面 - Hosteka',
  robots: { index: false, follow: false },
}

export default function AdminAnnouncementsPage() {
  return <AdminAnnouncementsScreen />
}
