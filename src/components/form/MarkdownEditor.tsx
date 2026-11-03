'use client'

import * as React from 'react'
import {
  Bold,
  Eye,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Palette,
  Pencil,
  Strikethrough,
  Table,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import SafeMarkdown from '@/components/SafeMarkdown'
import { cn } from '@/lib/utils'
import { makeTable, prefixLines, wrapSelection, type Edit } from './markdown-edits'

/** 本文で使える色。globals.css の .text-color-* に対応する */
const COLORS = [
  { name: 'red', label: '赤', swatch: 'bg-red-500' },
  { name: 'blue', label: '青', swatch: 'bg-blue-500' },
  { name: 'green', label: '緑', swatch: 'bg-green-500' },
  { name: 'orange', label: 'オレンジ', swatch: 'bg-orange-500' },
  { name: 'purple', label: '紫', swatch: 'bg-purple-500' },
  { name: 'pink', label: 'ピンク', swatch: 'bg-pink-500' },
  { name: 'gray', label: 'グレー', swatch: 'bg-gray-500' },
] as const

/**
 * ツールバーのボタン。
 * **関数ではなくコンポーネントにしてある。** 描画中に呼ぶ関数へ
 * ハンドラを渡すと、その中の ref 参照が描画時アクセスと見なされる。
 */
function Tool({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground"
    >
      {icon}
    </Button>
  )
}

/**
 * `rows` から最低の高さを出すための、Textarea の実寸。
 * `text-base`（1rem）× `leading-relaxed`（1.625）と、`py-3`（0.75rem×2）。
 * **Textarea 側を変えたらここも合わせること。**
 */
const LINE_HEIGHT_REM = 1.625
const PADDING_Y_REM = 1.5

/**
 * Markdown の入力欄。
 *
 * ツールバーとその場プレビューを持つ。**説明欄はこのアプリで一番長く
 * 書かれる場所**なので、記法を覚えていなくても書けるようにする。
 *
 * プレビューは同じ `SafeMarkdown` で描く。別の描画器を使うと、
 * 書いているものと公開されるものがずれる。
 */
export function MarkdownEditor({
  id,
  value,
  onChange,
  rows = 10,
  placeholder,
  invalid,
  describedBy,
}: {
  id: string
  value: string
  onChange: (next: string) => void
  /**
   * 書き始める前の高さ（行数）。
   *
   * 既定は説明欄の想定（10行 ≒ 280px）。**画面の3分の1くらいを占める**
   * のは意図したもので、「ここは長く書く欄だ」という合図になる。
   * これ以上大きくすると、モバイルで欄の下にある項目へ届かなくなる。
   */
  rows?: number
  placeholder?: string
  invalid?: boolean
  describedBy?: string
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  const [preview, setPreview] = React.useState(false)

  const apply = (fn: (value: string, start: number, end: number) => Edit) => {
    const el = ref.current
    if (!el) return
    const edit = fn(value, el.selectionStart, el.selectionEnd)
    onChange(edit.text)
    // 値の反映後に選択を戻す。戻さないと毎回末尾へ飛ぶ
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(edit.selectionStart, edit.selectionEnd)
    })
  }

  const insert = (snippet: string) =>
    apply((v, start, end) => ({
      text: v.slice(0, start) + snippet + v.slice(end),
      selectionStart: start + snippet.length,
      selectionEnd: start + snippet.length,
    }))


  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-input',
        invalid && 'border-destructive'
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-[var(--surface-subtle)] px-1.5 py-1">
        <Tool
          label={'大見出し'}
          icon={<Heading1 className="size-4" />}
          onClick={() => apply((v, s, e) => prefixLines(v, s, e, '### ', '見出し'))}
        />
        <Tool
          label={'中見出し'}
          icon={<Heading2 className="size-4" />}
          onClick={() => apply((v, s, e) => prefixLines(v, s, e, '#### ', '見出し'))}
        />

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <Tool
          label={'太字'}
          icon={<Bold className="size-4" />}
          onClick={() => apply((v, s, e) => wrapSelection(v, s, e, '**', '**', '太字'))}
        />
        <Tool
          label={'斜体'}
          icon={<Italic className="size-4" />}
          onClick={() => apply((v, s, e) => wrapSelection(v, s, e, '*', '*', '斜体'))}
        />
        <Tool
          label={'取り消し線'}
          icon={<Strikethrough className="size-4" />}
          onClick={() => apply((v, s, e) => wrapSelection(v, s, e, '~~', '~~', '取り消し'))}
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="文字色"
              aria-label="文字色"
              className="text-muted-foreground hover:text-foreground"
            >
              <Palette className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto">
            <div className="flex gap-1.5">
              {COLORS.map((color) => (
                <button
                  key={color.name}
                  type="button"
                  title={color.label}
                  aria-label={color.label}
                  onClick={() =>
                    apply((v, s, e) =>
                      wrapSelection(v, s, e, `{${color.name}}`, `{/${color.name}}`, 'テキスト')
                    )
                  }
                  className={cn('size-8 rounded-lg transition-transform hover:scale-110', color.swatch)}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <Tool
          label={'箇条書き'}
          icon={<List className="size-4" />}
          onClick={() => apply((v, s, e) => prefixLines(v, s, e, '- ', '項目'))}
        />
        <Tool
          label={'番号付き'}
          icon={<ListOrdered className="size-4" />}
          onClick={() => apply((v, s, e) => prefixLines(v, s, e, '1. ', '項目'))}
        />

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <Tool
          label={'リンク'}
          icon={<Link2 className="size-4" />}
          onClick={() => apply((v, s, e) => wrapSelection(v, s, e, '[', '](https://)', 'リンクの文字'))}
        />
        <Tool
          label={'表'}
          icon={<Table className="size-4" />}
          onClick={() => insert(makeTable(2, 3))}
        />

        {/* プレビューは右端。書く道具とは役割が違う */}
        <Button
          type="button"
          variant="default"
          size="xs"
          onClick={() => setPreview((v) => !v)}
          className="ml-auto"
        >
          {preview ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
          {preview ? '編集に戻る' : 'プレビュー'}
        </Button>
      </div>

      {preview ? (
        <div className="min-h-40 px-3.5 py-3">
          {value.trim() ? (
            <SafeMarkdown>{value}</SafeMarkdown>
          ) : (
            <p className="text-sm text-muted-foreground">まだ何も書かれていません</p>
          )}
        </div>
      ) : (
        <Textarea
          ref={ref}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          /*
            **`rows` だけでは効かない。** Textarea は `field-sizing-content`
            を持っていて、高さを中身に合わせる。空のうちは `min-h-24`
            （約3行）まで潰れ、`rows` は無視される。
            最低の高さを `rows` から出して渡すことで、書き始める前の
            大きさが「これくらい書く欄だ」という合図になる。
            中身が増えれば従来どおり伸びる。
          */
          style={{ minHeight: `calc(${rows} * ${LINE_HEIGHT_REM}rem + ${PADDING_Y_REM}rem)` }}
          placeholder={placeholder}
          aria-describedby={describedBy}
          // 枠は外側が持つ。二重に線が出ないようにする
          className="rounded-none border-0 focus-visible:ring-0"
        />
      )}
    </div>
  )
}
