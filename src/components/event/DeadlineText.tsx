'use client'

import * as React from 'react'

import { cardUrgency } from './deadline'

/**
 * カードの隅に出す「急ぎ」の一言。
 *
 * 残り時間は時計に依存するので、マウント後に計算する。
 * サーバー出力に入れると、CDN にキャッシュされた HTML が古い残り時間を
 * 配ることになる。
 */
export function DeadlineText({
  deadline,
  remaining,
  capacity,
  className,
}: {
  deadline: string | null
  remaining: number | null
  capacity: number | null
  className?: string
}) {
  const [text, setText] = React.useState<string | null>(null)

  React.useEffect(() => {
    const update = () => setText(cardUrgency({ deadline, remaining, capacity }, Date.now()))
    update()
    const timer = setInterval(update, 60_000)
    return () => clearInterval(timer)
  }, [deadline, remaining, capacity])

  if (!text) return null

  return (
    <span className={`shrink-0 font-semibold text-primary ${className ?? ''}`}>{text}</span>
  )
}
