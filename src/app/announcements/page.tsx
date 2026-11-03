import type { Metadata } from 'next'

import AnnouncementsScreen from '@/screens/content/AnnouncementsScreen'

/**
 * お知らせの一覧。
 *
 * **セッションもデータも取得しない**（CLAUDE.md「レンダリングとキャッシュ」）。中身は
 * `GET /api/v1/announcements` をクライアントから取る。
 */
export const metadata: Metadata = {
  title: 'お知らせ - Hosteka',
}

export default function AnnouncementsPage() {
  return <AnnouncementsScreen />
}
