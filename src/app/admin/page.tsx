import type { Metadata } from 'next'

import AdminHomeScreen from '@/screens/admin/AdminHomeScreen'

/**
 * 管理画面のトップ。
 *
 * **セッションもデータも取得しない**（CLAUDE.md「レンダリングとキャッシュ」）。管理者かどうかは
 * API が DB で確かめ、入れないときは画面が案内する。
 */
export const metadata: Metadata = {
  title: '管理画面 - Hosteka',
  robots: { index: false, follow: false },
}

export default function AdminPage() {
  return (
    <AdminHomeScreen />
  )
}
