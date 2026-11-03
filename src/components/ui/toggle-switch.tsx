'use client'

import * as React from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * ON/OFF のスライドトグル。
 *
 * **このアプリではチェックボックスを使わない**（docs/DESIGN_GUIDELINES.md）。
 * 単一の真偽値はすべてこれで表す。画面側で `<input type="checkbox">` を
 * 直接書かないこと。
 *
 * ネイティブのチェックボックスは color-scheme に強く影響され、ブラウザや
 * OS の設定で見た目が破綻する（実際に「未チェックが真っ黒」になる不具合が
 * 出ている）。描画を自前で持つことで環境差をなくす。
 *
 * 溝は押し込み（pressed）、つまみは押し出し（raised-subtle）にして、
 * 触れる部分がどこかを立体で示す。つまみは小さいので影は弱いほうを使う。
 */
function ToggleSwitch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="toggle-switch"
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors',
        'pressed bg-muted',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:shadow-none',
        'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="toggle-switch-thumb"
        className={cn(
          // つまみは 20px しかない。ボタンと同じ影だと、大きさに対して濃すぎる
          'raised-subtle pointer-events-none block size-5 rounded-full bg-card ring-0 transition-transform',
          'translate-x-0.5 data-[state=checked]:translate-x-[1.375rem]'
        )}
      />
    </SwitchPrimitive.Root>
  )
}

/**
 * ラベル付きのトグル。説明文を添えられる。
 * ラベル全体が操作対象になるので、トグル本体だけを狙う必要がない。
 */
function ToggleField({
  label,
  description,
  className,
  id,
  ...props
}: React.ComponentProps<typeof ToggleSwitch> & {
  label: React.ReactNode
  description?: React.ReactNode
}) {
  const generatedId = React.useId()
  const fieldId = id ?? generatedId

  return (
    <label
      htmlFor={fieldId}
      className={cn(
        'flex cursor-pointer items-start justify-between gap-4 rounded-lg px-1 py-2',
        props.disabled && 'cursor-not-allowed opacity-60',
        className
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
        ) : null}
      </span>
      <ToggleSwitch id={fieldId} className="mt-0.5" {...props} />
    </label>
  )
}

export { ToggleSwitch, ToggleField }
