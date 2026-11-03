import { Suspense } from 'react'
import type { Metadata } from 'next'

import AdminOrgsScreen from '@/screens/admin/AdminOrgsScreen'

/**
 * グループの一覧。
 *
 * **セッションもデータも取得しない**（CLAUDE.md「レンダリングとキャッシュ」）。管理者かどうかは
 * API が DB で確かめ、入れないときは画面が案内する。
 */
export const metadata: Metadata = {
  title: 'グループの管理 - Hosteka',
  robots: { index: false, follow: false },
}

export default function AdminOrgsPage() {
  /* useSearchParams を使う画面は Suspense で包む必要がある */
  return (
    <Suspense>
      <AdminOrgsScreen />
    </Suspense>
  )
}
