'use client'

import * as React from 'react'
import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * 説明の付いた選択肢から1つ選ぶ。
 *
 * **ラジオは使わない**（docs/DESIGN_GUIDELINES.md §5）。ネイティブの
 * ラジオは `color-scheme` に強く影響され、環境によって見た目が破綻する。
 *
 * `OptionGroupField` のセグメントと使い分ける。あちらは短い語を横に
 * 並べる形なので、**1行では意味が伝わらない選択肢**（「どこから投稿するか」
 * のように、選ぶと何が起きるかを読ませたいもの）はこちらを使う。
 *
 * **選択済みを色だけで示さない。** 枠と塗りに加えてチェックを出す
 * （色覚特性によっては差が分からない）。
 */
export type Choice<T extends string> = {
  value: T
  label: React.ReactNode
  /**
   * ラベルの隣に出す小さな札（「おすすめ」など）。
   * **`Field` の「必須」と同じ形にしてある** — 淡い primary の面に
   * primary の文字。画面をまたいで「小さな札＝その項目についての注記」
   * という対応が揃う。
   */
  badge?: React.ReactNode
  description?: React.ReactNode
  /** 選べるが、押すと別のことが起きる（権限の要求など）ときの但し書き */
  note?: React.ReactNode
  icon?: React.ReactNode
}

export function ChoiceCards<T extends string>({
  value,
  onChange,
  choices,
  label,
  className,
}: {
  /** まだ選んでいない状態を持てる。**空文字を「未選択」に流用しない** */
  value: T | null
  onChange: (value: T) => void
  choices: Choice<T>[]
  /** 読み上げ用のまとまりの名前。見出しは呼び出し側が描く */
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('space-y-2', className)}>
      {choices.map((choice) => {
        const selected = choice.value === value
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(choice.value)}
            className={cn(
              'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
              'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              selected
                ? 'raised-subtle border-primary bg-primary/5'
                : 'border-border bg-card hover:bg-accent'
            )}
          >
            <span
              className={cn(
                'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input text-transparent'
              )}
              aria-hidden
            >
              <Check className="size-3.5" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                {choice.icon}
                {choice.label}
                {choice.badge ? (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                    {choice.badge}
                  </span>
                ) : null}
              </span>
              {choice.description ? (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {choice.description}
                </span>
              ) : null}
              {choice.note ? (
                <span className="mt-1 block text-xs font-medium text-primary">{choice.note}</span>
              ) : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
