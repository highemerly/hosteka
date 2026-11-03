'use client'

import * as React from 'react'
import Link from 'next/link'

/**
 * ハッシュタグなどの分類タグ。
 *
 * docs/DESIGN_GUIDELINES.md の3段階のうち、いちばん弱い段。
 * 塗り（中立色）のみ・境界なしで、読み飛ばしてよいことを示す。
 *
 * **青にしない。** 青は読んでほしい情報（締切・残席）のために空けてある。
 * タグを青にすると、重要な情報と同じ色が並んで強弱が消える。
 */
export function Tag({
  children,
  href,
  className,
}: {
  children: React.ReactNode
  href?: string
  className?: string
}) {
  const cls = [
    'inline-flex items-center rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors',
    href ? 'hover:bg-accent hover:text-foreground' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return href ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <span className={cls}>{children}</span>
  )
}
