import type { Metadata } from 'next'

import AccountSettingsScreen from '@/screens/account/AccountSettingsScreen'

export const metadata: Metadata = {
  title: 'プロフィール設定 - Hosteka',
  description: 'ユーザーページに出すプロフィールを設定します。',
  robots: { index: false, follow: false },
}

export default function AccountSettingsPage() {
  return <AccountSettingsScreen />
}
