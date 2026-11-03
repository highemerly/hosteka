import { Suspense } from 'react'
import type { Metadata } from 'next'

import MyPreEventsScreen from '@/screens/dashboard/MyPreEventsScreen'

/**
 * あなたの日程調整一覧。
 *
 * **このページはセッションもデータも取得しない**（イベント側と同じ）。
 * 未ログインなら API が 401 を返し、画面がログインへ案内する
 * （`proxy.ts` がこのパスをリダイレクト対象から外しているのはそのため）。
 */
export const metadata: Metadata = {
  title: 'あなたの日程調整 - Hosteka',
  description: 'あなたが主催・回答した日程調整の一覧です。',
  robots: { index: false, follow: false },
}

export default function MyPreEventsPage() {
  /* useSearchParams を使う画面は Suspense で包む必要がある */
  return (
    <Suspense>
      <MyPreEventsScreen />
    </Suspense>
  )
}
