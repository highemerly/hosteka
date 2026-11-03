import { Suspense } from 'react'
import type { Metadata } from 'next'

import AdminReportsScreen from '@/screens/admin/AdminReportsScreen'

/**
 * 通報の一覧。
 *
 * **セッションもデータも取得しない**（CLAUDE.md「レンダリングとキャッシュ」）。管理者かどうかは
 * API が DB で確かめ、入れないときは画面が案内する。
 */
export const metadata: Metadata = {
  title: '通報 - Hosteka',
  robots: { index: false, follow: false },
}

export default function AdminReportsPage() {
  /* useSearchParams を使う画面は Suspense で包む必要がある */
  return (
    <Suspense>
      <AdminReportsScreen />
    </Suspense>
  )
}
