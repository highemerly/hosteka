import Link from 'next/link'

import { ContentPage } from '@/components/content/ContentPage'
import { Button } from '@/components/ui/button'

/**
 * 404。
 *
 * **全ページの RSC ペイロードに載る。** Next.js は not-found の境界を
 * どのルートにも含めるので、ここが旧 `Header` / `Footer` を掴んでいると、
 * 移行済みの画面まで旧UIの断片を配ることになる（実際そうなっていた）。
 */
export default function NotFound() {
  return (
    <ContentPage
      title="ページが見つかりません"
      lead="お探しのページは、存在しないか削除された可能性があります。"
    >
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" asChild>
          <Link href="/events">イベントを探す</Link>
        </Button>
        <Button variant="default" asChild>
          <Link href="/">トップページへ</Link>
        </Button>
      </div>
    </ContentPage>
  )
}
