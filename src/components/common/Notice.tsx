import * as React from 'react'
import { Info, TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * 操作の前に必ず読ませたい一言。
 *
 * **バッジでも補助テキストでもない。** 補助テキスト（`text-muted-foreground`）は
 * 「必要なら読む」ものなので、読み飛ばされて困ることを書く場所ではない。
 * ここは面と境界を持たせて、本文の流れから浮かせる。
 *
 * 強調の描き分けは docs/DESIGN_GUIDELINES.md の「情報の強弱」に従う
 * （線（濃）＋淡い塗り＋太字）。参加条件の warning（`ConditionLink`）と
 * 同じ青を使うので、「淡い青の面＝読んでほしい」という対応が画面をまたいで揃う。
 *
 * ### 色を増やさないこと
 *
 * 状態のトーン（`--primary-surface`）は**用意していない**。あちらは
 * 「確定している」を意味するので（docs/DESIGN_GUIDELINES.md）、
 * これから起きることの説明に使うと意味が反転する。
 *
 * 面は `primary/10` に留める。状態ボタン（`--primary-surface`）より
 * 明らかに薄くしておかないと、**押せない知らせがボタンに見える**。
 * 立体表現を付けないのも同じ理由。
 */
export type NoticeTone =
  /** これから起きること・条件。読んでほしいが、悪いことではない */
  | 'attention'
  /** 取り消せない・失われる。読まずに進むと困る */
  | 'danger'

const TONE: Record<NoticeTone, { box: string; title: string; icon: React.ReactNode }> = {
  attention: {
    box: 'border-primary bg-primary/10',
    title: 'text-primary',
    icon: <Info className="size-4" />,
  },
  danger: {
    box: 'border-destructive bg-destructive/10',
    title: 'text-destructive',
    icon: <TriangleAlert className="size-4" />,
  },
}

export function Notice({
  tone = 'attention',
  title,
  icon,
  children,
  className,
}: {
  tone?: NoticeTone
  /** 一行で結論を書く。読まれるのはここだけかもしれない */
  title: React.ReactNode
  /** 既定の記号を差し替えたいときだけ渡す */
  icon?: React.ReactNode
  /** 補足。無くてもよい */
  children?: React.ReactNode
  className?: string
}) {
  const t = TONE[tone]

  return (
    <div
      /*
        読み上げに割り込ませない。`role="alert"` は操作の結果として
        現れた知らせのためのもので、最初から置いてある説明には使わない。
      */
      className={cn('rounded-lg border p-3', t.box, className)}
    >
      <p className={cn('flex items-start gap-2 text-sm font-semibold', t.title)}>
        <span className="mt-0.5 shrink-0">{icon ?? t.icon}</span>
        <span className="min-w-0">{title}</span>
      </p>

      {/* 本文はフラットに読ませる。面の色に文字まで引っ張られると読みにくい */}
      {children ? (
        <div className="mt-1.5 pl-6 text-sm text-foreground">{children}</div>
      ) : null}
    </div>
  )
}
