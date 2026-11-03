import type { Metadata } from 'next'
import Link from 'next/link'

import { ContentPage } from '@/components/content/ContentPage'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: '機能紹介 - Hosteka',
  description: 'Hosteka の主要機能をご紹介します。',
}

// ISRでキャッシュを有効化（5分間隔で更新）
export const revalidate = 300

/**
 * 機能紹介。**中身はまだ無い。**
 *
 * 旧実装は「🚧 準備中」を大きく出していたが、絵文字と見出しで場所を
 * 取っているだけで、来た人が次にどこへ行けばいいのかが書いていなかった。
 * 空のページこそ**行き先を渡す。**
 */
export default function FeaturePage() {
  return (
    <ContentPage
      title="機能紹介"
      lead="このページは準備中です。"
    >
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" asChild>
          <Link href="/events">イベントを探す</Link>
        </Button>
        <Button variant="default" asChild>
          <Link href="/pre-events">日程調整を探す</Link>
        </Button>
        <Button variant="default" asChild>
          <Link href="/faq">よくある質問</Link>
        </Button>
      </div>
    </ContentPage>
  )
}
