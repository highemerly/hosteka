'use client'

import * as React from 'react'

import { COOKIE_VIEWER } from '@/lib/cookie-names'
import { parseViewerCookie, readCookie, type Viewer } from '@/lib/viewer'

/**
 * ログイン中の表示用情報。
 *
 * **fetch しない。** Cookie を同期的に読むので、ヘッダーが一瞬
 * 未ログインの姿で描かれてから差し替わる、ということが起きない。
 * これが `/api/v1/me` を作らずに済んでいる理由。
 *
 * 初回レンダリングでは null を返す。サーバーで描いた HTML は全閲覧者で
 * 同一（＝CDN にキャッシュできる）ので、閲覧者ごとの姿は必ず
 * マウント後に現れる。ここでずれると hydration が壊れる。
 */
export function useViewer(): { viewer: Viewer | null; status: 'loading' | 'authed' | 'anonymous' } {
  const [viewer, setViewer] = React.useState<Viewer | null>(null)
  const [ready, setReady] = React.useState(false)

  /*
    **マウント後に一度だけ読む。** ここは「描画から導ける値」ではなく
    ブラウザにしか無いもの（Cookie）の取り込みで、`loading` を1フレーム
    挟むこと自体が目的。サーバーが描いた HTML と初回の描画を一致させ、
    そのうえで閲覧者ごとの姿へ差し替える（上の説明を参照）。

    `useSyncExternalStore` にすると初回から `anonymous` を名乗ることになり、
    ヘッダーが一瞬「未ログイン」の姿を見せる。それを避けるための作りなので、
    規則の側を抑止する。
  */
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewer(parseViewerCookie(readCookie(COOKIE_VIEWER, document.cookie)))
    setReady(true)
  }, [])

  return {
    viewer,
    status: !ready ? 'loading' : viewer ? 'authed' : 'anonymous',
  }
}
