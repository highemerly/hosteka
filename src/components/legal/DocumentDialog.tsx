'use client'

import * as React from 'react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/**
 * 文中の語から開く、読むためのモーダル。同意の文の「利用規約」に使う。
 *
 * 文の外に置く入口（札）は `ConditionLink`。こちらは**文の途中に置ける**
 * 下線の語で、同意する対象そのものを指す。
 *
 * **別のタブに飛ばさない。** 書きかけの選択（プラットフォーム・ホスト名）を
 * 置いて離れさせない。
 *
 * 入口は文字リンクの姿をした `<button>`。**`<a>` や span にしない** —
 * 同意のラベル（`ConsentCheckbox`）の中に置くので、interactive content で
 * ないとラベルのクリック転送が働き、開いただけで同意が入る。
 */
export function DocumentDialog({
  trigger,
  title,
  children,
}: {
  /** 文中に出す語 */
  trigger: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-primary underline underline-offset-2 hover:no-underline"
        >
          {trigger}
        </button>
      </DialogTrigger>

      {/* 説明文を持たないことを Radix に明示する（無いと警告が出る） */}
      <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {/* 規約は長い。見出しと閉じるボタンを残して中だけ流す */}
        <div className="max-h-[60vh] overflow-y-auto">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
