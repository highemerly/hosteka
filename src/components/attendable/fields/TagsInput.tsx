'use client'

import * as React from 'react'
import { Plus, X } from 'lucide-react'

import { Input } from '@/components/ui/input'

/**
 * 押すだけで入れられる候補。
 *
 * **タグは空欄のままにされやすい。** 何を書けばよいのか分からないうえ、
 * 打つ手間もかかる。よく使われるものを並べておくと、1回押すだけで済む。
 * イベントと日程調整で同じ語彙を使いたいので、ここに1つだけ置く。
 */
export const COMMON_HASHTAGS = [
  'オフ会',
  '勉強会',
  'オンライン',
  '誰でも参加OK',
  '飛び入り歓迎',
  'ゲーム',
] as const

/**
 * ハッシュタグの入力。
 *
 * Enter か「,」で確定する。**自由入力のまま保存しない** — 先頭の `#`、
 * 空白、重複はここで落とす。保存時に整えると、入力した見た目と
 * 保存された値が食い違う。
 */
export function TagsInput({
  id,
  value,
  onChange,
  max = 10,
  suggestions,
  describedBy,
  invalid,
}: {
  id: string
  value: string[]
  onChange: (next: string[]) => void
  max?: number
  /** 押すだけで入れられる候補。既に入っているものは出さない */
  suggestions?: readonly string[]
  describedBy?: string
  invalid?: boolean
}) {
  const [draft, setDraft] = React.useState('')

  const commit = (raw: string) => {
    const tag = raw.trim().replace(/^#+/, '').replace(/\s+/g, '')
    if (!tag) return
    if (value.includes(tag) || value.length >= max) {
      setDraft('')
      return
    }
    onChange([...value, tag])
    setDraft('')
  }

  /*
    まだ入れていない候補だけ出す。入っているものを残すと、
    押しても何も起きない的が並ぶ。上限に達したら候補ごと引っ込める。
  */
  const available =
    value.length >= max ? [] : (suggestions ?? []).filter((tag) => !value.includes(tag))

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    /*
      **変換確定の Enter を確定として扱わない。**
      日本語入力では、漢字を確定する Enter もここへ来る。
      素通しすると「交流会」と打ちたいのに「こうりゅうかい」の確定で
      タグになってしまう。
    */
    if (e.nativeEvent.isComposing) return

    if (e.key === 'Enter' || e.key === ',') {
      // Enter でフォームが送信されないようにする
      e.preventDefault()
      commit(draft)
      return
    }
    // 空欄で Backspace なら直前のタグを消す。よくある操作
    if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="space-y-2">
      <Input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        // 入力途中のまま送信されると、打ったのに消えたように見える
        onBlur={() => commit(draft)}
        placeholder={value.length >= max ? `${max}個までです` : '入力して Enter'}
        disabled={value.length >= max}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
      />

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                aria-label={`#${tag} を外す`}
                className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                #{tag}
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        候補。**選択済みのものとは描き分ける。** 上の一覧は塗り（＝入っている）、
        こちらは線のみ（＝まだ入っていない）にして、`+` で押した結果を示す
        （docs/DESIGN_GUIDELINES.md の情報の強弱）。同じ姿で並べると、
        どちらを押すと増えてどちらを押すと減るのか分からない。
      */}
      {available.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs text-muted-foreground">よく使われるタグ</span>
          {available.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => commit(tag)}
              aria-label={`#${tag} を追加`}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              #{tag}
              <Plus className="size-3 opacity-60" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
