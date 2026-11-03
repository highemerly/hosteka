'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  fromDateKey,
  isPastDay,
  isSameDay,
  monthGrid,
  toDateKey,
  WEEKDAYS,
  weekdayTone,
} from './date-grid'

/**
 * 日付を選ぶカレンダー。
 *
 * **旧フォームのカレンダーを踏襲する。** 月の升目を出して、日付を押すと
 * 候補に入る／外れる。慣れている操作なので形を変えない。
 * 色だけデザイントークンに置き換えた（旧実装は `bg-blue-600` 等の直書きで
 * ダークモードで破綻していた）。
 *
 * 過去の日は押せない。**今日は押せる** — 当日の候補は立てられる。
 */
export function DateCalendar({
  selected,
  locked = [],
  onToggle,
  className,
}: {
  /** `YYYY-MM-DD` の配列 */
  selected: string[]
  /** 変更できない日付（既に回答が付いた候補など） */
  locked?: string[]
  onToggle: (dateKey: string) => void
  className?: string
}) {
  /*
    出す月。**選択済みの候補があるなら、いちばん早い候補の月から始める。**
    編集で開いたとき今月を出すと、候補が来月以降にある場合は升目が一つも
    塗られておらず、選び直したのかと思わせる。

    マウント時の値で決め打ちしない — 編集画面ではフォームの初期値が空で、
    保存済みの候補は `reset()` であとから流し込まれる。利用者が月を送ったら
    その月に留める（値が変わるたびに戻されると、先の月へ進めない）。
  */
  const [pinnedMonth, setPinnedMonth] = React.useState<Date | null>(null)
  const earliest = [...selected].sort()[0]
  const base = earliest ? fromDateKey(earliest) : new Date()
  const month = pinnedMonth ?? new Date(base.getFullYear(), base.getMonth(), 1)

  const cells = monthGrid(month.getFullYear(), month.getMonth())
  const today = new Date()
  const selectedSet = new Set(selected)
  const lockedSet = new Set(locked)

  const shift = (delta: number) =>
    setPinnedMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1))

  return (
    <div className={cn('rounded-xl border border-border bg-card p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="前の月"
          onClick={() => shift(-1)}
        >
          <ChevronLeft className="size-4" />
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-foreground">
            {month.getFullYear()}年{month.getMonth() + 1}月
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-primary"
            onClick={() => setPinnedMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            今日
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="次の月"
          onClick={() => shift(1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="mt-2 grid grid-cols-7">
        {WEEKDAYS.map((day, i) => (
          <div
            key={day}
            className={cn(
              'py-1 text-center text-xs font-medium',
              weekdayTone(i) === 'sunday'
                ? 'text-destructive'
                : weekdayTone(i) === 'saturday'
                  ? 'text-primary'
                  : 'text-muted-foreground'
            )}
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} className="aspect-square" />

          const key = toDateKey(date)
          const isSelected = selectedSet.has(key)
          const isLocked = lockedSet.has(key)
          const isToday = isSameDay(date, today)
          const past = isPastDay(date, today)
          const tone = weekdayTone(date.getDay())

          return (
            <button
              key={key}
              type="button"
              disabled={isLocked || past}
              aria-pressed={isSelected}
              aria-label={`${month.getMonth() + 1}月${date.getDate()}日`}
              title={isLocked ? '既に回答が付いている候補日です' : undefined}
              onClick={() => onToggle(key)}
              className={cn(
                'grid aspect-square place-items-center rounded-lg text-sm transition-colors',
                'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                isLocked && 'cursor-not-allowed',
                /*
                  **回答済みの日も「選択中」の塗りのまま。** 候補であることに
                  変わりはないので、別の色にすると外れたように見える。
                  押せないことは disabled とカーソル、それに一覧側の
                  「回答◯件」で示す。淡い色に落として区別するのは、
                  コントラストを削って見分けを付ける手なので採らない。
                */
                isSelected
                  ? 'raised-on-color bg-primary font-semibold text-primary-foreground'
                  : past
                    ? 'text-muted-foreground/40'
                    : cn(
                        'hover:bg-accent',
                        tone === 'sunday'
                          ? 'text-destructive'
                          : tone === 'saturday'
                            ? 'text-primary'
                            : 'text-foreground'
                      ),
                // 今日は枠で示す。塗ると「選択済み」と見分けが付かない
                !isSelected && isToday && 'ring-2 ring-inset ring-[var(--calendar-accent)]'
              )}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-primary" aria-hidden />
          選択中
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="size-3 rounded ring-2 ring-inset ring-[var(--calendar-accent)]"
            aria-hidden
          />
          今日
        </span>
      </div>

      {/* 凡例に色の見本を足さない。塗りは「選択中」と同じなので、
          見分けが付かないものを並べても読めない */}
      {locked.length > 0 ? (
        <p className="mt-1 text-center text-xs text-muted-foreground">
          回答が届いている候補日は、ここからは外せません
        </p>
      ) : null}
    </div>
  )
}
