import 'server-only'

import { NextResponse, type NextRequest } from 'next/server'

import { renderGenericImage } from './render'

/**
 * リンクカードの画像（OG 画像）の配り方。イベント（`/og/events/[id]`）と
 * 日程調整（`/og/pre-events/[id]`）で同じものを使う。
 *
 * **画像を作るのは重い**（フォントを読み、レイアウトして PNG に焼く）ので、作る回数を減らす:
 *
 * - URL に版（`?v=<updatedAt>`）を付け、CDN に長く持たせる（`immutable`）。編集すれば
 *   `updatedAt` が変わり、URL ごと変わる
 * - **版が違えば作らず、今の版の URL へリダイレクトする。** `v` を変えて CDN を素通りさせ、
 *   描画を繰り返させる使い方を止める
 * - 作った画像は手元にもいくつか持つ
 *
 * **非公開・無効化・存在しないものには、題名を含まない共通の画像を返す**
 * （メタデータと同じ規則。`server/metadata/hidden.ts`）。
 */

const IMMUTABLE = 'public, max-age=86400, s-maxage=31536000, immutable'
const CACHE_LIMIT = 50

const rendered = new Map<string, Buffer>()
let generic: Promise<Buffer> | null = null

function png(body: Buffer, cacheControl: string) {
  return new NextResponse(new Uint8Array(body), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': cacheControl },
  })
}

async function cached(key: string, render: () => Promise<Buffer>): Promise<Buffer> {
  const hit = rendered.get(key)
  if (hit) return hit
  const image = await render()
  rendered.set(key, image)
  // 古いものから捨てる（Map は入れた順を保つ）
  if (rendered.size > CACHE_LIMIT) rendered.delete(rendered.keys().next().value!)
  return image
}

/** 中身を見せないときの共通の画像。中身は1種類しかないので、版を問わず1日持たせる */
export async function genericOgImage(): Promise<NextResponse> {
  generic ??= renderGenericImage()
  return png(await generic, 'public, max-age=3600, s-maxage=86400')
}

/**
 * 版の付いた画像を返す。`path` は版を除いた URL のパス（`/og/events/<id>`）。
 * 要求の版が今の版と違えば、作らずに今の版へリダイレクトする。
 */
export async function versionedOgImage(
  request: NextRequest,
  path: string,
  updatedAt: Date,
  render: () => Promise<Buffer>
): Promise<NextResponse> {
  const version = String(updatedAt.getTime())
  if (request.nextUrl.searchParams.get('v') !== version) {
    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: `${path}?v=${version}`,
        // 次に編集されるまでは正しい行き先なので、短く持たせる
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    })
  }

  return png(await cached(`${path}:${version}`, render), IMMUTABLE)
}
