'use client'

import * as React from 'react'

import { Checkbox } from '@/components/ui/checkbox'

/**
 * 同意のチェック。
 *
 * **チェックボックスを使うのはここだけ**（docs/DESIGN_GUIDELINES.md §5 の例外）。
 * スライドトグルは「設定のオン・オフ」に読める。同意は切り替える設定ではなく、
 * 読んだうえで印を付ける行為なので、左に箱を置く形にする。
 * ネイティブの `<input type="checkbox">` は使わない（Radix の `Checkbox`）。
 *
 * ラベルの中に文書を開くボタン（`DocumentDialog`）を置いてよい。
 * ラベルのクリック転送は、押した先が interactive content（`<button>` や
 * `<a href>`）のとき働かないと HTML 仕様で決まっているので、
 * **文書を開いただけで同意が入ることはない。** ボタンを span + onClick などに
 * 変えると転送が復活し、同意が黙って入る。jsdom はラベルの転送自体を
 * 実装していないので、テストでは捕まらない。
 */
export function ConsentCheckbox({
  label,
  checked,
  onCheckedChange,
  id,
  error,
}: {
  label: React.ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  id?: string
  /**
   * 同意しないまま先へ進もうとしたときの吹き出し。
   *
   * **ボタンを非活性にして黙らせない。** 押せない理由が画面のどこにも
   * 出ず、押せないボタンの前で止まる。押させてから、どこを押せばよいかを
   * 箱の真下で言う。**重ねて出す**（`absolute`）ので、出ても下が動かない。
   */
  error?: string
}) {
  const generatedId = React.useId()
  const fieldId = id ?? generatedId

  return (
    <div className="relative flex items-start gap-3 px-1 py-2">
      <Checkbox
        id={fieldId}
        checked={checked}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        // `indeterminate` は使わないので、真偽値だけを返す
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="mt-0.5 size-5"
      />
      <label
        htmlFor={fieldId}
        className="min-w-0 cursor-pointer text-sm font-medium text-foreground"
      >
        {label}
      </label>
      {error ? (
        <p
          id={`${fieldId}-error`}
          role="alert"
          className="absolute top-full left-0 z-10 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-md"
        >
          {/* 矢印。箱（左端から px-1 + 箱の幅の半分）を指す */}
          <span
            aria-hidden
            className="absolute -top-1 left-[0.6rem] size-2.5 rotate-45 rounded-[2px] bg-foreground"
          />
          {error}
        </p>
      ) : null}
    </div>
  )
}
