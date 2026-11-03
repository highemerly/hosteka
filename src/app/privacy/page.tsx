import type { Metadata } from 'next'

import { ContentPage } from '@/components/content/ContentPage'
import { PRIVACY_TITLE, PrivacyDocument } from '@/components/legal/PrivacyDocument'

export const metadata: Metadata = {
  title: 'プライバシーポリシー - Hosteka (SNSコミュニティのためのイベントプラットフォーム)',
  description: 'Hostekaのプライバシーポリシー。個人情報の取り扱いについて説明しています。',
}

// ISRでキャッシュを有効化（５分間隔で更新）
export const revalidate = 300

export default function Privacy() {
  return (
    <ContentPage title={PRIVACY_TITLE}>
      <PrivacyDocument />
    </ContentPage>
  )
}