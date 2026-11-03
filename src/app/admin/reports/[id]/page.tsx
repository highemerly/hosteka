import type { Metadata } from 'next'

import AdminReportDetailScreen from '@/screens/admin/AdminReportDetailScreen'

/**
 * 通報の詳細。
 *
 * **セッションもデータも取得しない**（CLAUDE.md「レンダリングとキャッシュ」）。管理者かどうかは
 * API が DB で確かめ、入れないときは画面が案内する。
 */
export const metadata: Metadata = {
  title: '通報の詳細 - Hosteka',
  robots: { index: false, follow: false },
}

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <AdminReportDetailScreen id={id} />
  )
}
