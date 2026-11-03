import type { Metadata } from 'next'

import PreEventsListScreen from '@/screens/pre-events/PreEventsListScreen'

/**
 * 日程調整の一覧。
 *
 * **このページはセッションもデータも取得しない。** 出力HTMLが全閲覧者で
 * 同一になり、CDN にキャッシュできる。中身は PreEventsListScreen が
 * クライアントから /api/v1 経由で取る。
 */
export const metadata: Metadata = {
  title: '日程調整を探す - Hosteka (SNSコミュニティのためのイベントプラットフォーム)',
  description: 'Hosteka で参加者を募っている日程調整の一覧です。',
}

export default function PreEventsPage() {
  return (
    <PreEventsListScreen />
  )
}
