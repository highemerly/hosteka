import { Suspense } from 'react'
import type { Metadata } from 'next'

import MyEventsScreen from '@/screens/dashboard/MyEventsScreen'

/**
 * あなたのイベント一覧。
 *
 * **このページはセッションもデータも取得しない。**
 * 以前は `getSession()` を呼んでサインインへリダイレクトしていたが、
 * それだと出力HTMLが閲覧者ごとに変わりキャッシュできない。
 * ログインしていない場合は API が 401 を返し、画面がログインへ案内する
 * （`proxy.ts` がこのパスをリダイレクト対象から外しているのはそのため）。
 */
export const metadata: Metadata = {
  title: 'あなたのイベント - Hosteka',
  description: 'あなたが主催・参加しているイベントの一覧です。',
  robots: { index: false, follow: false },
}

export default function MyEventsPage() {
  /* useSearchParams を使う画面は Suspense で包む必要がある */
  return (
    <Suspense>
      <MyEventsScreen />
    </Suspense>
  )
}
