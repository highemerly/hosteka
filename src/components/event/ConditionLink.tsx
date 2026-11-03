'use client'

import * as React from 'react'
import { ChevronRight } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/**
 * 題名の下に並ぶ参加条件の入口。締切・定員・参加できるアカウント・参加規約。
 *
 * **ボタンにしない。** ここは「参加登録」と同じ高さに並ぶ列で、立体を持った
 * 小さな面が4つ並ぶと、押させたい操作（参加登録）と同じ強さの操作が
 * その下に横1列で続くことになる。読ませたいのは条件そのものなので、
 * 入力欄のラベル横に置く「Markdown対応 ？」と同じ**平らな文字**にする。
 *
 * **開き方を全部そろえる。** 以前は締切と対応サーバーがポップオーバー、
 * 参加規約だけモーダルだった。開くまでどちらか分からないものを
 * 隣り合わせに置くと、開いた瞬間に画面のどこを見ればよいかが毎回変わる。
 * 末尾の `＞` が「別の面が開く」の合図で、押した先は一律モーダル。
 */
export function ConditionLink({
  icon,
  label,
  tone = 'default',
  title,
  children,
}: {
  icon: React.ReactNode
  /** 畳んだ状態で読ませる一言。「残り5 / 20人」「回答締切 あと3日」 */
  label: React.ReactNode
  /**
   * 強弱。docs/DESIGN_GUIDELINES.md の3段階に対応する。
   *   default … 必要なら読む
   *   warning … 締切・残席。読んでほしい
   * **色だけで分ける。** 平らなまま濃さを変える。
   */
  tone?: 'default' | 'warning'
  /**
   * モーダルの見出し。
   *
   * **イベント名を添えない。** 以前は見出しの下に再掲していたが、
   * 開く直前まで同じ画面の題名を見ていたので、言われなくても分かる。
   */
  title: string
  /** モーダルの中身 */
  children: React.ReactNode
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={[
            // 角丸は rounded-lg でそろえる（docs/DESIGN_GUIDELINES.md）
            'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs transition-colors',
            tone === 'warning'
              ? 'bg-primary/10 font-semibold text-primary hover:bg-primary/20'
              : 'bg-muted font-medium text-muted-foreground hover:bg-accent hover:text-foreground',
          ].join(' ')}
        >
          <span className="shrink-0 opacity-70">{icon}</span>
          {label}
          <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden />
        </button>
      </DialogTrigger>

      {/* 説明文を持たないことを Radix に明示する（無いと警告が出る） */}
      <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {/* 参加規約は Markdown のことがあり、長さに上限がない。
            開き方をそろえた以上、溢れ方もそろえる */}
        <div className="max-h-[60vh] overflow-y-auto">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
