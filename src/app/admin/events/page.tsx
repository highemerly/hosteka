import { Suspense } from 'react'
import type { Metadata } from 'next'

import AdminContentListScreen from '@/screens/admin/AdminContentListScreen'

/**
 * イベントの一覧（非公開・無効化を含む）。
 *
 * **セッションもデータも取得しない**（CLAUDE.md「レンダリングとキャッシュ」）。管理者かどうかは
 * API が DB で確かめ、入れないときは画面が案内する。
 */
export const metadata: Metadata = {
  title: 'イベントの管理 - Hosteka',
  robots: { index: false, follow: false },
}

export default function AdminEventsPage() {
  /* useSearchParams を使う画面は Suspense で包む必要がある */
  return (
    <Suspense>
      <AdminContentListScreen kind="event" />
    </Suspense>
  )
}
