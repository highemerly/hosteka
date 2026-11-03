import { Suspense } from 'react'
import type { Metadata } from 'next'

import AdminContentListScreen from '@/screens/admin/AdminContentListScreen'

/**
 * 日程調整の一覧（非公開・無効化を含む）。
 *
 * **セッションもデータも取得しない**（CLAUDE.md「レンダリングとキャッシュ」）。管理者かどうかは
 * API が DB で確かめ、入れないときは画面が案内する。
 */
export const metadata: Metadata = {
  title: '日程調整の管理 - Hosteka',
  robots: { index: false, follow: false },
}

export default function AdminPreEventsPage() {
  /* useSearchParams を使う画面は Suspense で包む必要がある */
  return (
    <Suspense>
      <AdminContentListScreen kind="pre-event" />
    </Suspense>
  )
}
