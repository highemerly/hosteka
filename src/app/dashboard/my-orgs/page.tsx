import { Suspense } from 'react'
import type { Metadata } from 'next'

import MyOrgsScreen from '@/screens/orgs/MyOrgsScreen'

/**
 * あなたのグループ。
 *
 * **このページはセッションもデータも取得しない。** 未ログインの扱いは
 * API が決める（401 が返り、画面がログインへ案内する）。
 */
export const metadata: Metadata = {
  title: 'あなたのグループ - Hosteka',
  robots: { index: false, follow: false },
}

export default function MyOrgsPage() {
  /* useSearchParams を使う画面は Suspense で包む必要がある */
  return (
    <Suspense>
      <MyOrgsScreen />
    </Suspense>
  )
}
