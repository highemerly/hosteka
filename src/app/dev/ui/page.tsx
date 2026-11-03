import { notFound } from 'next/navigation'

import UiGallery from './UiGallery'

// 開発用。本番では 404 を返す。
export const dynamic = 'force-dynamic'

export default function DevUiPage() {
  if (process.env.DEV_MODE_ENABLED !== 'true' || process.env.NODE_ENV === 'production') {
    notFound()
  }
  return <UiGallery />
}
