import { Suspense } from 'react'
import type { Metadata } from 'next'

import AuthErrorScreen from '@/screens/auth/AuthErrorScreen'

/**
 * ログインの失敗。OAuth のコールバックがここへ飛ばしてくる。
 *
 * **searchParams をサーバーで読まない。** 読むとページが動的になり、
 * 失敗の理由がサーバー描画の HTML に混ざる。訳はクライアントで引く。
 */
export const metadata: Metadata = {
  title: 'ログインできませんでした - Hosteka',
  robots: { index: false },
}

export default function AuthErrorPage() {
  /* useSearchParams を使う画面は Suspense で包む必要がある */
  return (
    <Suspense>
      <AuthErrorScreen />
    </Suspense>
  )
}
