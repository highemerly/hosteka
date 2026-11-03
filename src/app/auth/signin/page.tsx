import { Suspense } from 'react'
import type { Metadata } from 'next'

import SignInScreen from '@/screens/auth/SignInScreen'

/**
 * ログイン。
 *
 * **このページはセッションもデータも取得しない。** ログイン済みの人が来ても
 * 追い返さない（別のアカウントで入り直したいことがある）。
 */
export const metadata: Metadata = {
  title: 'ログイン - Hosteka',
  description:
    'Mastodon・Misskey・Pleroma・X・Discord のアカウントで Hosteka にログインします。',
  robots: { index: false },
}

export default function SignInPage() {
  /* useSearchParams を使う画面は Suspense で包む必要がある */
  return (
    <Suspense>
      <SignInScreen />
    </Suspense>
  )
}
