'use client'

import Link from 'next/link'
import { CircleHelp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/**
 * 開催日が決まっていない人を日程調整へ送る。
 *
 * **開催日は必須なので、決まっていない人はここで詰まる。** 実際には
 * 日程調整（`/pre-events`）がその用途なのだが、イベントを作ろうとして
 * 入って来た人はその存在を知らない。適当な日を入れて作ってしまうと、
 * あとから開催日を前へ動かせない（`events/[id]` の PUT が拒む）。
 *
 * **モーダルにする。** 開催日の欄の下に説明を並べると、日程が決まって
 * いる大多数にとっては読み飛ばす3行になる。押した人にだけ出す。
 * 入口は欄の名前の隣（`Field` の `aside`）に、`MarkdownHint` と同じ
 * タグの体裁で置く。
 *
 * **イベントを作る手を止めさせない。** 「日程調整を作成する」は
 * 別の画面へ移るので、書きかけを持っている人は
 * `UnsavedChangesGuard` が引き止める（作成画面に同居している）。
 */
export function UndecidedDateDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {/*
          **`MarkdownHint` と同じ体裁のタグ。** ラベルの隣に置く小さな
          入口はこの形に揃える。ボタンとして立てると、開催日を入れる
          操作と同じ強さで並んでしまう（欄の名前より先に目に入る）。
          塗りは中立色・境界なし（docs/DESIGN_GUIDELINES.md の「タグ」）。
        */}
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 rounded-lg bg-muted px-1.5 py-0.5',
            'text-[11px] font-medium text-muted-foreground transition-colors',
            'hover:bg-accent hover:text-foreground'
          )}
        >
          開催日が決まっていないときは？
          <CircleHelp className="size-3.5" aria-hidden />
        </button>
      </DialogTrigger>

      {/* 説明は本文に置く。`DialogDescription` は1文しか収まらない */}
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>日程調整で候補日を集められます</DialogTitle>
        </DialogHeader>

        {/*
          **日程調整が何をするものかだけを書く。** 「まずこちらを作って、
          決まったらイベントを作る」という順序は、読めば分かる。
        */}
        <p className="text-sm text-foreground">
          候補日を並べて、参加できる日を○△×で答えてもらえます。
          決まってから、その日でイベントを作ってください。
        </p>

        <DialogFooter>
          <Button type="button" variant="primary" asChild>
            <Link href="/pre-events/create">日程調整を作成する</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
