import { NextResponse } from 'next/server'

import { renderGenericImage } from '@/server/og/render'

/**
 * サイト共通のリンクカードの画像。イベント以外のページの `og:image`（`lib/og/default.ts`）。
 *
 * 中身は変わらないので、ビルドのときに1回だけ描いて静的なファイルとして配る。
 * 非公開のイベントに返す共通の画像（`/og/events/[id]`）と同じもの。
 */
export const dynamic = 'force-static'

export async function GET() {
  return new NextResponse(new Uint8Array(await renderGenericImage()), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
