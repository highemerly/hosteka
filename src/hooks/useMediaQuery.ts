'use client'

import * as React from 'react'

/**
 * メディアクエリの一致を購読する。
 *
 * CSS だけで出し分けられない場合にだけ使う（例: 表示件数のように
 * 「何件を hidden 側に回すか」という数値がロジックに影響するとき）。
 * 見た目だけの出し分けは CSS で行うこと。
 *
 * サーバー描画時は false を返す。初期表示は狭い側に倒れる。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setMatches(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])

  return matches
}
