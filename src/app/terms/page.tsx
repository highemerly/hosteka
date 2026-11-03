import type { Metadata } from 'next'

import { ContentPage } from '@/components/content/ContentPage'
import { TERMS_TITLE, TermsDocument } from '@/components/legal/TermsDocument'

export const metadata: Metadata = {
  title: 'サービス利用規約 - Hosteka (SNSコミュニティのためのイベントプラットフォーム)',
  description: 'Hostekaのサービス利用規約。本サービスをご利用いただく際の規約をご確認いただけます。',
}

// ISRでキャッシュを有効化（５分間隔で更新）
export const revalidate = 300

export default function Terms() {
  return (
    <ContentPage title={TERMS_TITLE}>
      <TermsDocument />
    </ContentPage>
  )
}