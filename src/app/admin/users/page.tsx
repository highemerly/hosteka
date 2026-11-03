import { Suspense } from 'react'
import type { Metadata } from 'next'

import AdminUsersScreen from '@/screens/admin/AdminUsersScreen'

/**
 * ユーザーと BAN 済みの一覧。
 *
 * **セッションもデータも取得しない**（CLAUDE.md「レンダリングとキャッシュ」）。管理者かどうかは
 * API が DB で確かめ、入れないときは画面が案内する。
 */
export const metadata: Metadata = {
  title: 'ユーザーの管理 - Hosteka',
  robots: { index: false, follow: false },
}

export default function AdminUsersPage() {
  /* useSearchParams を使う画面は Suspense で包む必要がある */
  return (
    <Suspense>
      <AdminUsersScreen />
    </Suspense>
  )
}
