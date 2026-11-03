'use client'

import * as React from 'react'

/**
 * 1行に収めた要素が、実際に切れているかを見る。
 *
 * **切れているときだけ続きを読む操作を出すため。** 収まっている行にまで
 * 出すと、押しても同じ文が出るだけの操作が並ぶ。
 *
 * 幅は画面の向きや段組みで変わるので、要素の大きさの変化を購読する。
 * サーバー描画時と ResizeObserver の無い環境では false（操作を出さない側）。
 */
export function useIsTruncated<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = React.useRef<T>(null)
  const [truncated, setTruncated] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const update = () => setTruncated(el.scrollWidth > el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, truncated]
}
