import { Suspense } from 'react'
import type { Metadata } from 'next'

import ExternalLinkScreen from '@/screens/content/ExternalLinkScreen'

export const metadata: Metadata = {
  title: '外部のサイトへ移動します - Hosteka',
  description: 'Hosteka の管理外のサイトへ移動します。',
  robots: { index: false, follow: false },
}

export default function ExternalLinkPage() {
  /* useSearchParams を使う画面は Suspense で包む必要がある */
  return (
    <Suspense>
      <ExternalLinkScreen />
    </Suspense>
  )
}
