import type { Metadata } from 'next'

import PreEventDetailScreen from '@/screens/pre-events/PreEventDetailScreen'
import { getPreEventMetadata } from '@/server/metadata/pre-event'

/**
 * 日程調整の詳細。
 *
 * **このページはセッションもデータも取得しない。**
 * generateMetadata だけがサーバーで動く（OGP はクローラーが JS を
 * 実行しないため、サーバー側に残す必要がある）。
 * 本文は PreEventDetailScreen がクライアントから /api/v1 経由で取得する。
 */
type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return getPreEventMetadata(id)
}

export default async function PreEventDetailPage({ params }: Props) {
  const { id } = await params
  return <PreEventDetailScreen preEventId={id} />
}
