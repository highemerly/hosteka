'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * 入力欄1つ分の枠。
 *
 * ラベル・補足・エラーの置き方を1箇所に決める。**各画面で組み立てると、
 * エラーが出る位置や必須の示し方が画面ごとにずれる。**
 *
 * 必須は「*」ではなく文字で示す。記号は凡例を探させるし、
 * 読み上げでも意味が伝わらない。
 * **「任意」は書かない。** ほとんどの項目が任意なので、全部に付くと
 * 文字数だけ増えて「必須」が埋もれる。
 */
export function Field({
  label,
  htmlFor,
  required,
  aside,
  description,
  error,
  hint,
  children,
  className,
}: {
  label: React.ReactNode
  htmlFor: string
  required?: boolean
  /**
   * ラベルの隣に並べる印。「Markdown対応」など。
   *
   * **`label` に混ぜない。** あちらは `<label htmlFor>` の中身なので、
   * リンクを入れると「ラベルを押すと入力欄へ移る」のと
   * 「リンク先へ飛ぶ」が同じ的の上で競合する。
   */
  aside?: React.ReactNode
  /** 入力の前に読ませたい補足 */
  description?: React.ReactNode
  error?: string
  /** 入力欄の下に出す軽い注記（文字数など） */
  hint?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-baseline gap-2">
        <label htmlFor={htmlFor} className="text-base font-medium text-foreground">
          {label}
        </label>
        {required ? (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
            必須
          </span>
        ) : null}
        {aside}
      </div>

      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}

      {children}

      {/*
        エラーは入力欄の下。上に出すと、直したあと目線が戻る先が
        毎回変わる。role=alert で読み上げにも届かせる。

        **注記（文字数など）はエラーと同時に出す。** 「長すぎます」と
        言われた瞬間こそ、あと何文字なのかを見たい。
      */}
      {(error || hint) && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          {error ? (
            <p
              id={`${htmlFor}-error`}
              role="alert"
              className="text-sm font-medium text-destructive"
            >
              {error}
            </p>
          ) : (
            <span />
          )}
          {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
        </div>
      )}
    </div>
  )
}

/** 入力欄に渡す a11y 属性。エラーの有無で aria を切り替える */
export function fieldAria(id: string, error?: string) {
  return {
    id,
    'aria-invalid': Boolean(error) || undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  }
}

/**
 * 見出し付きの区画。
 *
 * 旧フォームは5段のステップだったが、**行き来しづらいわりに
 * 全体像が見えない。** 1枚に並べ、見出しで区切る。
 *
 * `collapsible` を付けた区画は畳んで始める。**初めての人に、使うか
 * 分からない項目まで全部見せない。** 見出しだけ並んでいれば、
 * 何が設定できるかは分かるし、要るときに開ける。
 */
export function FormSection({
  id,
  title,
  description,
  collapsible,
  defaultOpen = false,
  /** 中に入力済みの値があるか。あれば畳んだままにしない */
  hasValue,
  openKey,
  children,
}: {
  /** ページ内リンクの飛び先。付けると見出しの行が `<section id>` になる */
  id?: string
  title: string
  description?: React.ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  hasValue?: boolean
  /**
   * 外から開かせる合図。**値が変わるたびに開く。**
   *
   * 真偽値にしない。一度開かせたあと利用者が畳み直すと、同じリンクを
   * もう一度押しても値が変わらず、開かなくなる。押した回数を渡す。
   */
  openKey?: number
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(defaultOpen)

  /*
    編集で開いたときなど、値が入っている区画は開けておく。
    畳んだままだと「設定したはずのものが消えた」ように見える。

    **effect ではなく描画中に合わせる。** effect で `setOpen` すると
    一度畳んだ姿を描いてから開くことになり、React も連鎖的な再描画として
    警告する（`react-hooks/set-state-in-effect`）。前回の値を覚えておいて、
    変わった描画でそのまま直す — React が勧めている形。
  */
  const [lastHasValue, setLastHasValue] = React.useState(hasValue)
  if (hasValue !== lastHasValue) {
    setLastHasValue(hasValue)
    if (hasValue) setOpen(true)
  }

  // ページ内リンクから飛んで来たとき。畳んだままだと、飛んだ先に何も無い
  const [lastOpenKey, setLastOpenKey] = React.useState(openKey)
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey)
    setOpen(true)
  }

  /*
    ページ内リンクの飛び先は、ヘッダーのぶんだけ余裕を取る。
    **ヘッダーは `sticky top-0` の h-14（56px）** なので、
    `scrollIntoView({ block: 'start' })` だけでは見出しが下に潜る。
  */
  const frame = cn(
    'border-t border-border pt-8 first:border-t-0 first:pt-0',
    id && 'scroll-mt-20'
  )

  if (!collapsible) {
    return (
      <section id={id} className={frame}>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        {/*
          `<p>` ではなく `<div>`。**説明に箇条書きを置く節がある**ので、
          `<p>` だと `<ul>` を入れた瞬間に不正な入れ子になる（ブラウザが
          勝手に閉じるので、見た目は崩れるのに原因が読めない）。
        */}
        {description ? (
          <div className="mt-1 text-sm text-muted-foreground">{description}</div>
        ) : null}
        <div className="mt-5 space-y-6">{children}</div>
      </section>
    )
  }

  return (
    <section id={id} className={frame}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-center gap-2 text-left"
      >
        <ChevronDown
          className={cn(
            'size-5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
        />
        <span className="min-w-0">
          <span className="block text-lg font-bold text-foreground">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
          ) : null}
        </span>
      </button>

      {/*
        中身は見出しの文字に揃えて字下げする（矢印のぶん）。
        **狭い画面では字下げしない。** 28px は本文の左右余白と同じ幅で、
        入力欄が並ぶ区画ではその一列ぶんがそのまま入力できる幅を削る。
        揃えの美しさより、選択肢の名前が数文字しか見えないほうが困る。
      */}
      {open ? <div className="mt-5 space-y-6 sm:pl-7">{children}</div> : null}
    </section>
  )
}
