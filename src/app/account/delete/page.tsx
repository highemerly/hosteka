import type { Metadata } from 'next'

import DeleteAccountScreen from '@/screens/account/DeleteAccountScreen'

/**
 * アカウントの削除。
 *
 * **セッションもデータも取得しない**（CLAUDE.md「レンダリングとキャッシュ」）。
 * 未ログインなら API が 401 を返し、画面がログインへ案内する。
 */
export const metadata: Metadata = {
  title: 'アカウントを削除する - Hosteka',
  description: 'アカウントと、これまでの記録をすべて削除します。',
  robots: { index: false, follow: false },
}

export default function DeleteAccountPage() {
  return (
    <DeleteAccountScreen />
  )
}
