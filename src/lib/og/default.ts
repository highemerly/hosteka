import { publicBaseUrl } from '@/lib/base-url'

import { OG_SIZE } from './size'

/**
 * サイト共通のリンクカードの画像（`app/og/default`）。イベント以外のページで使う。
 *
 * **Next のメタデータはキー単位で丸ごと上書きされる。** ページ側が `openGraph` を持つと
 * root layout の既定の画像ごと消えるので、`openGraph` を持つページもこれを通す。
 *
 * URL は相対（`/og/default`）で書き、root layout の `metadataBase` で絶対URLにする。
 * 公開URLが無いビルドでは `metadataBase` も無いので、画像を載せない（localhost を配らない）。
 */
export function defaultOgImages() {
  return publicBaseUrl() ? [{ url: '/og/default', ...OG_SIZE, alt: 'Hosteka' }] : []
}

/** 画像があれば大きく出す。無いのに `summary_large_image` にすると、空の大きな枠になる */
export function twitterCard(images: readonly unknown[]): 'summary' | 'summary_large_image' {
  return images.length > 0 ? 'summary_large_image' : 'summary'
}
