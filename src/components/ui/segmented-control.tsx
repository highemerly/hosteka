'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * 択一の切り替え。
 *
 * タブではなく**同じ一覧の絞り込み**に使う。選択中の区画が動いて
 * 追いかけられるので、どこからどこへ切り替わったのかが分かる。
 *
 * 溝は押し込み（pressed）、選択中のつまみは押し出し（raised）にする。
 * ToggleSwitch と同じ立体の使い分けで、「触れる部分」が一貫する。
 *
 * 選択肢は等幅にしてある。幅が文字数で変わると、切り替えるたびに
 * 隣の選択肢の位置が動いて押し間違える。
 *
 * **等幅は grid で作る。** flex + flex-1 では等幅にならない。
 * この部品は inline なので幅が中身で決まり、`flex-basis: 0` でも
 * 各項目は自分の max-content 幅に落ち着く。結果「開催予定」だけが広くなり、
 * 半分ずつのつまみと文字の中心がずれる。
 * `1fr` の列なら、内容に合わせた幅でも列が等しく揃う。
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  'aria-label': ariaLabel,
}: {
  value: T
  onValueChange: (value: T) => void
  /**
   * `tone: 'primary'` を付けた選択肢は、選ばれたときにつまみが青くなる。
   *
   * **色は「選択中かどうか」ではなく、その選択肢の意味に付ける。**
   * 全部を青くすると「欠席」を選んだときまで青く塗られ、
   * 青が「進めたい方向」を意味しなくなる。選択中であることは
   * つまみの位置と押し出しが示すので、色に頼る必要はない。
   */
  options: { value: T; label: React.ReactNode; tone?: 'default' | 'primary' }[]
  className?: string
  'aria-label'?: string
}) {
  /*
    **どれも選ばれていない状態を「先頭を選択中」に倒さない。**
    倒すと、押していないのに1つ目が選ばれて見え、そのまま送信できる。
    日程調整の回答（未回答の候補日）で実際にそう見えていた。
  */
  const found = options.findIndex((o) => o.value === value)
  const index = Math.max(found, 0)
  const selected = found >= 0
  const colored = selected && options[index]?.tone === 'primary'

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'pressed relative inline-grid h-11 rounded-lg border border-border bg-muted p-1',
        className
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {/* 選択中の区画。位置だけを動かすので、文字の再描画が起きない。
          未選択なら出さない */}
      <span
        aria-hidden
        hidden={!selected}
        className={cn(
          'absolute top-1 bottom-1 left-1 rounded-[calc(var(--radius-lg)-2px)] transition-transform duration-200 ease-out motion-reduce:transition-none',
          colored
            ? 'raised-on-color bg-primary'
            // 中立のつまみは溝（--muted 0.97）と面（--card 1.0）の差が
            // 3% しかない。境界を引かないと選択中かどうかが分からない
            : 'raised border border-border bg-card'
        )}
        style={{
          // p-1（0.5rem）を除いた内側を等分する。つまみ自身の幅の
          // 100% ずつ動かせば、区画の境目にぴったり止まる
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />

      {options.map((option) => {
        const isSelected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onValueChange(option.value)}
            className={cn(
              /*
                px は狭い側に寄せる。3つ並ぶと padding だけで
                120px 使い、モバイルで文字がはみ出す。
                min-w-0 と truncate で、はみ出す前に切る。

                **モバイルの px は詰めてある。** 2つ並べて1行に収める場所
                （あなたのイベント／日程調整の絞り込み）が、375px 幅の端末で
                ぎりぎり収まる値。余りがあるときは呼び出し側が `grow` で広げる。

                **呼び出し側で幅を決め打ちしないこと。** 内側の余白と
                噛み合うと、切られていることに気づけないまま文字が消える
                （出欠登録で `sm:w-48` を付けて「受領」が切れていた）。
                幅を指定しなければ中身に合わせて広がる（inline-grid）。
              */
              'relative z-10 min-w-0 truncate rounded-lg px-1.5 text-sm font-medium transition-colors sm:px-5',
              'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              /*
                **`isSelected`（この選択肢か）で分ける。**
                `selected`（どれかが選ばれているか）を使うと、選択が入った
                瞬間に3つとも選択中の色になる。primary の場合は白文字に
                なるため、未選択の2つが溝の上で見えなくなっていた。
              */
              isSelected
                ? colored
                  ? 'text-primary-foreground'
                  : 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
