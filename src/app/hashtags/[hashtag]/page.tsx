import { Suspense } from 'react'
import type { Metadata } from 'next'

import HashtagScreen from '@/screens/hashtags/HashtagScreen'

/**
 * ハッシュタグのページ。イベントと日程調整の両方を出す。
 *
 * **イベントの下（`/events/hashtag/…`）に置かない。** タグは両方に付くので、
 * ページはタグのもの。旧URLは `next.config.ts` の redirects がここへ送る。
 *
 * **このページはセッションもデータも取得しない。**
 */
type Props = { params: Promise<{ hashtag: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hashtag } = await params
  const tag = decodeURIComponent(hashtag)

  return {
    title: `#${tag} - ハッシュタグ - Hosteka`,
    description: `「${tag}」のハッシュタグが付いたイベントと日程調整の一覧ページです。`,
  }
}

export default async function HashtagPage({ params }: Props) {
  const { hashtag } = await params

  /* useSearchParams を使う画面は Suspense で包む必要がある */
  return (
    <Suspense>
      <HashtagScreen tag={decodeURIComponent(hashtag)} />
    </Suspense>
  )
}
