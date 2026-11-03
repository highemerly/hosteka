import type { Metadata } from 'next'

import ScheduledPostsScreen from '@/screens/dashboard/ScheduledPostsScreen'

/**
 * 予約投稿。
 *
 * **セッションもトークンも取得しない**（CLAUDE.md「レンダリングとキャッシュ」）。
 */
export const metadata: Metadata = {
  title: '予約投稿 - Hosteka',
  description: 'Mastodon サーバーに予約されている投稿を確認・取り消しできます。',
  robots: { index: false, follow: false },
}

export default function ScheduledPostPage() {
  return (
    <ScheduledPostsScreen />
  )
}
