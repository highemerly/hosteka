import type { Metadata } from 'next'

import SessionsScreen from '@/screens/account/SessionsScreen'

/**
 * ログイン中の端末。
 *
 * **セッションもデータも取得しない**（CLAUDE.md「レンダリングとキャッシュ」）。
 * 未ログインなら API が 401 を返し、画面がログインへ案内する。
 */
export const metadata: Metadata = {
  title: 'ログイン中の端末 - Hosteka',
  description: 'ログイン中の端末を確認し、身に覚えのないものをログアウトさせられます。',
  robots: { index: false, follow: false },
}

export default function SessionsPage() {
  return (
    <SessionsScreen />
  )
}
