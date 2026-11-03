import type { Metadata } from 'next'

import { getEventMetadata } from '@/server/metadata/event'
import EventDetailScreen from '@/screens/events/EventDetailScreen'

/**
 * イベント詳細。
 *
 * **このページはセッションもデータも取得しない。**
 * generateMetadata だけがサーバーで動く（OGP はクローラーが JS を
 * 実行しないため、サーバー側に残す必要がある）。
 * 本文は EventDetailScreen がクライアントから /api/v1 経由で取得する。
 *
 * こうすることで出力HTMLが全閲覧者で同一になり、CDN キャッシュが効く。
 * ページでセッションやデータを取ると、RSC ペイロード経由で閲覧者ごとの
 * 情報が HTML に載る。
 */
type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return getEventMetadata(id)
}

export default async function EventDetailPage({ params }: Props) {
  const { id } = await params
  return <EventDetailScreen eventId={id} />
}
