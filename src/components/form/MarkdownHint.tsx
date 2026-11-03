'use client'

import Link from 'next/link'
import { CircleHelp } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * 「Markdown対応」の印。書き方の解説への入口を兼ねる。
 *
 * **印とリンクを分けない。** 「Markdown が使える」と知った直後に
 * 「どう書くのか」を知りたくなるので、その2つを離すと目的地を探させる。
 * 「？」は行き先があることの合図で、ラベルごと押せる。
 *
 * **新しいタブで開く。** 説明も参加規約もこの画面で最も長く書かれる欄で、
 * 同じタブで解説へ飛ぶと書きかけを置いて離れることになる。
 *
 * 塗りは中立色・境界なし（docs/DESIGN_GUIDELINES.md の「タグ」）。
 * 隣の「必須」バッジと強弱で競わせない。
 */
export function MarkdownHint({ className }: { className?: string }) {
  return (
    <Link
      href="/markdown-guide"
      target="_blank"
      rel="noreferrer"
      // 見えている文字は「Markdown対応」だけなので、
      // 押すと何が起きるかは読み上げにも伝える
      aria-label="Markdown対応。書き方の解説を新しいタブで開く"
      className={cn(
        // 角丸は rounded-lg でそろえる（docs/DESIGN_GUIDELINES.md）
        'inline-flex items-center gap-1 rounded-lg bg-muted px-1.5 py-0.5',
        'text-[11px] font-medium text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-foreground',
        className
      )}
    >
      Markdown対応
      <CircleHelp className="size-3.5" aria-hidden />
    </Link>
  )
}
