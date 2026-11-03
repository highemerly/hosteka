import { Suspense } from 'react'
import type { Metadata } from 'next'

import HashtagEventsScreen from '@/screens/events/HashtagEventsScreen'

/**
 * ハッシュタグ別のイベント一覧。
 *
 * **このページはセッションもデータも取得しない。**
 * 以前は prisma を直接呼び、しかも「人気のハッシュタグ」を出すためだけに
 * 全イベントの hashtags 列を読んでいた。
 */
type Props = { params: Promise<{ hashtag: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hashtag } = await params
  const tag = decodeURIComponent(hashtag)

  return {
    title: `#${tag} - ハッシュタグ別イベント一覧 - Hosteka`,
    description: `「${tag}」のハッシュタグが付いたイベントの一覧ページです。`,
  }
}

export default async function HashtagEventsPage({ params }: Props) {
  const { hashtag } = await params

  /* useSearchParams を使う画面は Suspense で包む必要がある */
  return (
    <Suspense>
      <HashtagEventsScreen tag={decodeURIComponent(hashtag)} />
    </Suspense>
  )
}
