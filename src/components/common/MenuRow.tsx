import * as React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const MENU_ROW =
  'flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent'

/**
 * メニューの1行。説明は付けない（題名で分かることは書かない）。
 *
 * **行き先を持つものと、その場で実行するものを同じ姿にする。**
 * 並びの中で1つだけボタンの見た目が違うと、押せる・押せないの差に見える。
 *
 * マイページと管理画面のトップで同じものを使う。
 */
export function MenuRow({
  href,
  onClick,
  title,
  icon,
  meta,
}: {
  href?: string
  onClick?: () => void
  title: string
  icon: React.ReactNode
  /** 矢印の手前に置く短い値（件数など） */
  meta?: React.ReactNode
}) {
  const body = (
    <>
      <span className="text-muted-foreground" aria-hidden>
        {icon}
      </span>
      <span className="font-medium text-foreground">{title}</span>
      <span className="ml-auto flex items-center gap-2">
        {meta}
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </span>
    </>
  )

  if (href) {
    return (
      <Link href={href} className={MENU_ROW}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={MENU_ROW}>
      {body}
    </button>
  )
}
