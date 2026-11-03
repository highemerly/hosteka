import { Suspense } from 'react'
import type { Metadata } from 'next'

import NotificationsScreen from '@/screens/notifications/NotificationsScreen'

/**
 * 通知。
 *
 * **このページはセッションもデータも取得しない**（CLAUDE.md のレンダリング方針）。
 * ログインしていなければ API が 401 を返し、画面がログインへ案内する。
 */
export const metadata: Metadata = {
  title: '通知 - Hosteka',
  description: 'あなたに届いた通知の一覧です。',
  robots: { index: false, follow: false },
}

export default function NotificationsPage() {
  /* useSearchParams を使う画面は Suspense で包む必要がある */
  return (
    <Suspense>
      <NotificationsScreen />
    </Suspense>
  )
}
