import type { Metadata } from 'next'

import FaqScreen from '@/screens/content/FaqScreen'

export const metadata: Metadata = {
  title: 'よくある質問 - Hosteka',
  description: 'Hosteka に関するよくある質問と回答です。',
}

// ISRでキャッシュを有効化（５分間隔で更新）
export const revalidate = 300

export default function FAQPage() {
  return (
    <FaqScreen />
  )
}
