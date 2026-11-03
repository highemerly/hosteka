import type { Metadata } from 'next'

import EventsListScreen from '@/screens/events/EventsListScreen'

/**
 * イベント一覧。
 *
 * **このページはセッションもデータも取得しない。** 出力HTMLが全閲覧者で
 * 同一になり、CDN にキャッシュできる。中身は EventsListScreen が
 * クライアントから /api/v1 経由で取る。
 *
 * 以前は getSession と prisma を直接呼び、ハッシュタグ候補を出すためだけに
 * 全イベントの hashtags 列を読んでいた。
 */
export const metadata: Metadata = {
  title: 'イベントを探す - Hosteka (SNSコミュニティのためのイベントプラットフォーム)',
  description: 'Hosteka で開催される注目のイベントを一覧で表示します。',
}

export default function EventsPage() {
  // ヘッダーとフッターは app/layout.tsx が描く
  return <EventsListScreen />
}
