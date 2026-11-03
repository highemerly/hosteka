'use client'

import * as React from 'react'
import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { VALIDATION_LIMITS } from '@/schemas/limits'
import type { OptionResponseType } from '@/schemas/event'

/**
 * イベントのオプション選択。
 *
 * Hosteka のオプションは EventOptionGroup / EventOption の2階層で、
 * グループごとに回答の種類（単一選択・複数選択・自由入力）が変わる。
 * 選択肢には定員（maxParticipants）が付くことがある。
 *
 * **チェックボックスとラジオは使わない**（docs/DESIGN_GUIDELINES.md）。
 *   単一選択 … セグメント（1つだけ選べることを見た目で示す）
 *   複数選択 … 選択チップ（チェックが付く）
 *   自由入力 … 1行の入力欄（選択肢は無い）
 *
 * 影はボタンより弱くする（raised-subtle）。選択肢が横に何個も並ぶため、
 * ボタンと同じ強さだと画面が凹凸だらけになる。
 */

export type OptionChoice = {
  id: string
  name: string
  /** 定員。null なら無制限 */
  maxParticipants?: number | null
  /** 現在の選択数。定員との差で残席を出す */
  takenCount?: number
}

export type OptionGroup = {
  id: string
  title: string
  responseType: OptionResponseType
  /** 自由入力（`text`）では空 */
  options: OptionChoice[]
}

function remainingLabel(o: OptionChoice): { text: string; full: boolean } | null {
  if (o.maxParticipants == null) return null
  const left = o.maxParticipants - (o.takenCount ?? 0)
  return left <= 0
    ? { text: '満席', full: true }
    : { text: `残り${left}`, full: false }
}

function Choice({
  option,
  selected,
  disabled,
  multiple,
  onSelect,
}: {
  option: OptionChoice
  selected: boolean
  disabled: boolean
  multiple: boolean
  onSelect: () => void
}) {
  const remaining = remainingLabel(option)

  return (
    <button
      type="button"
      role={multiple ? 'checkbox' : 'radio'}
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'raised-subtle inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
        selected
          ? 'border-primary bg-primary/10 font-medium text-primary'
          : 'border-border bg-card text-foreground hover:bg-accent',
        disabled && 'cursor-not-allowed opacity-50 shadow-none'
      )}
    >
      {/* 選択済みを色だけで示さない。色覚特性によっては差が分からない */}
      {multiple ? (
        <span
          aria-hidden
          className={cn(
            'grid size-4 shrink-0 place-items-center rounded-sm border',
            selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
          )}
        >
          {selected ? <Check className="size-3" /> : null}
        </span>
      ) : (
        <span
          aria-hidden
          className={cn(
            'grid size-4 shrink-0 place-items-center rounded-full border',
            selected ? 'border-primary' : 'border-border'
          )}
        >
          {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
        </span>
      )}

      {option.name}

      {remaining ? (
        <span
          className={cn(
            'shrink-0 text-xs',
            remaining.full ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {remaining.text}
        </span>
      ) : null}
    </button>
  )
}

export function OptionGroupField({
  group,
  value,
  onChange,
  text = '',
  onTextChange,
}: {
  group: OptionGroup
  /** 選択中の option id。自由入力では使わない */
  value: string[]
  onChange: (next: string[]) => void
  /** 自由入力の本文 */
  text?: string
  onTextChange?: (next: string) => void
}) {
  const multiple = group.responseType === 'multiple'

  const toggle = (id: string) => {
    if (multiple) {
      onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
    } else {
      // 単一選択は選び直しのみ。同じものを押しても解除しない
      onChange([id])
    }
  }

  /*
    自由入力。**残り文字数だけを出す。** 「自由に入力できます」と書いても
    入力欄を見れば分かることで、見て分からないのは上限のほうだけ。
  */
  if (group.responseType === 'text') {
    const over = text.length > VALIDATION_LIMITS.OPTION_TEXT_ANSWER
    return (
      <div>
        <label
          htmlFor={`option-text-${group.id}`}
          className="mb-2 block text-sm font-medium"
        >
          {group.title}
        </label>
        <Input
          id={`option-text-${group.id}`}
          value={text}
          onChange={(e) => onTextChange?.(e.target.value)}
          aria-invalid={over || undefined}
        />
        <p
          className={cn(
            'mt-1 text-right text-xs',
            over ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {text.length} / {VALIDATION_LIMITS.OPTION_TEXT_ANSWER}
        </p>
      </div>
    )
  }

  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-2 text-sm font-medium">
        {group.title}
        <span className="font-normal text-xs text-muted-foreground">
          {multiple ? '複数選択できます' : '1つ選んでください'}
        </span>
      </legend>
      <div role={multiple ? 'group' : 'radiogroup'} className="flex flex-wrap gap-2">
        {group.options.map((o) => {
          const remaining = remainingLabel(o)
          const selected = value.includes(o.id)
          return (
            <Choice
              key={o.id}
              option={o}
              selected={selected}
              // 満席でも既に選んでいるなら操作できる（解除するため）
              disabled={Boolean(remaining?.full) && !selected}
              multiple={multiple}
              onSelect={() => toggle(o.id)}
            />
          )
        })}
      </div>
    </fieldset>
  )
}
