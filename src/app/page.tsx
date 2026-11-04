import type { Metadata } from 'next'

import HomeScreen from '@/screens/home/HomeScreen'
import { defaultOgImages, twitterCard } from '@/lib/og/default'

/**
 * トップページ。
 *
 * **このページはセッションもデータも取得しない。** 出力HTMLが全閲覧者で
 * 同一になり、CDN にキャッシュできる（`proxy.ts` が `/` に
 * `s-maxage=1800` を付ける）。中身は HomeScreen がクライアントから
 * `/api/v1/home` 経由で取る。
 *
 * 以前は `export const dynamic = 'force-dynamic'` を置いて prisma を直に
 * 叩いており、**最も見られる画面が唯一キャッシュできない**状態だった。
 */
const DESCRIPTION =
  'Hosteka は Mastodon、Misskey、Pleroma、Discord と連携したコミュニティイベントプラットフォームです。SNSアカウントで簡単にイベント開催・参加が可能。'

/*
  **トップページにも OGP を書く。** イベント詳細（`server/metadata/event.ts`）
  には前からあったが、ここには無かった。サービスそのもののURLを貼ったときだけ
  見出しと説明しか出ない状態になっていた。
*/
export const metadata: Metadata = {
  title: 'Hosteka(SNSコミュニティのためのイベントプラットフォーム)',
  description: DESCRIPTION,
  openGraph: {
    siteName: 'Hosteka',
    title: 'Hosteka — SNSコミュニティのためのイベントプラットフォーム',
    description: DESCRIPTION,
    type: 'website',
    locale: 'ja_JP',
    images: defaultOgImages(),
  },
  twitter: {
    card: twitterCard(defaultOgImages()),
    title: 'Hosteka — SNSコミュニティのためのイベントプラットフォーム',
    description: DESCRIPTION,
  },
}

export default function HomePage() {
  // ヘッダーとフッターは app/layout.tsx が描く
  return <HomeScreen />
}
