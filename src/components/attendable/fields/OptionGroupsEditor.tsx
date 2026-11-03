'use client'

import * as React from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { VALIDATION_LIMITS } from '@/schemas/limits'
import type { OptionResponseType } from '@/schemas/event'

export type OptionGroupDraft = {
  title: string
  responseType: OptionResponseType
  options: { name: string; maxParticipants?: number | null }[]
}

/** 空の選択肢1つ分 */
const emptyOption = () => ({ name: '', maxParticipants: null })

/**
 * 追加したオプションに最初から出す選択肢の数。
 *
 * **1つでは設問にならない。** 「懇親会」に「参加する」しか選択肢が
 * 無い状態は起こりえないので、2つ並べておいて埋めてもらう。
 * 1つだけ出して「選択肢を追加」を押させると、押し忘れたまま
 * 保存しようとして弾かれる。
 */
const INITIAL_OPTIONS = 2

/** 回答の種類。参加登録側（ui/option-group.tsx）が切り替えるのもこれ */
const CHOICE_OPTIONS: { value: OptionResponseType; label: string }[] = [
  { value: 'single', label: '単一選択' },
  { value: 'multiple', label: '複数選択' },
  { value: 'text', label: '自由入力' },
]

/**
 * オプションの編集。
 *
 * Hosteka のオプションは2階層。**見出し（グループ）ごとに「1つだけ選ぶ」
 * 「いくつでも選ぶ」「自分で書く」が変わり、選択肢ごとに定員を付けられる。**
 * 参加登録側（ui/option-group.tsx）と同じ語彙で編集させる。
 *
 * 並べ替えは今は入れていない。追加した順に出る。
 */
export function OptionGroupsEditor({
  groups,
  onChange,
  errors,
}: {
  groups: OptionGroupDraft[]
  onChange: (next: OptionGroupDraft[]) => void
  /** `optionGroups.0.title` のようなキーで引く */
  errors?: Record<string, string | undefined>
}) {
  const update = (index: number, patch: Partial<OptionGroupDraft>) => {
    onChange(groups.map((g, i) => (i === index ? { ...g, ...patch } : g)))
  }

  const updateOption = (
    gi: number,
    oi: number,
    patch: Partial<OptionGroupDraft['options'][number]>
  ) => {
    update(gi, {
      options: groups[gi].options.map((o, i) => (i === oi ? { ...o, ...patch } : o)),
    })
  }

  return (
    <div className="space-y-4">
      {groups.map((group, gi) => (
        <div
          key={gi}
          className="rounded-xl border border-border bg-[var(--surface-subtle)] p-3 sm:p-4"
        >
          {/*
            **削除ボタンを縦の列にしない。** 以前はグループの削除を右端に
            立てていて、その1列（36px）が全行の右に空き続けていた。狭い画面では
            選択肢の名前欄がそのぶん押し潰され、数文字しか見えなくなる。
            見出しの行に畳めば、下は全幅を使える。
          */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <GripVertical className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
              <Input
                value={group.title}
                onChange={(e) => update(gi, { title: e.target.value })}
                placeholder="見出し（例: 食事メニュー、2次会出欠）"
                aria-label={`オプション${gi + 1}の見出し`}
                aria-invalid={Boolean(errors?.[`optionGroups.${gi}.title`]) || undefined}
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`オプション${gi + 1}を削除`}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onChange(groups.filter((_, i) => i !== gi))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            {errors?.[`optionGroups.${gi}.title`] ? (
              <p className="text-xs text-destructive">{errors[`optionGroups.${gi}.title`]}</p>
            ) : null}

            {/*
              **トグルではなく択一にする。** 「複数選択を許容する」のオフが
              何なのかは、切ってみるまで分からなかった。名前で並べていれば、
              どれを選んだのかもそのまま読める。

              既定は「単一選択」。多くの設問はそちらなので、
              例外のときだけ選び直してもらう。
            */}
            <SegmentedControl
              aria-label={`オプション${gi + 1}の回答の種類`}
              value={group.responseType}
              onValueChange={(v) => update(gi, { responseType: v as OptionResponseType })}
              options={CHOICE_OPTIONS}
              className="w-full sm:w-auto"
            />

            {/*
              **自由入力では選択肢を出さない。** 主催者が作るのは見出しだけで、
              中身は参加者が書く。入力済みの選択肢は消さずに持っておく
              （選び方を戻したときに書き直させない）。保存のときに落ちる。

              上限は画面を見ても分からず、外すと参加者側で弾かれるので書く。
            */}
            {group.responseType === 'text' ? (
              <p className="text-xs text-muted-foreground">
                参加者が{VALIDATION_LIMITS.OPTION_TEXT_ANSWER}文字まで入力できます
              </p>
            ) : (
              <div className="space-y-2">
                {group.options.map((option, oi) => (
                  <div key={oi} className="flex items-center gap-1.5 sm:gap-2">
                    <Input
                      value={option.name}
                      onChange={(e) => updateOption(gi, oi, { name: e.target.value })}
                      placeholder="選択肢の名前"
                      aria-label={`選択肢${oi + 1}の名前`}
                      className="min-w-0 flex-1"
                    />
                    {/* 定員は多くて3桁。狭い画面で名前欄を削ってまで
                        広く取る欄ではない */}
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={option.maxParticipants ?? ''}
                      onChange={(e) =>
                        updateOption(gi, oi, {
                          maxParticipants: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      placeholder="定員"
                      aria-label={`選択肢${oi + 1}の定員`}
                      className="w-20 shrink-0 px-2 sm:w-24 sm:px-3.5"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`選択肢${oi + 1}を削除`}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        update(gi, { options: group.options.filter((_, i) => i !== oi) })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}

                {errors?.[`optionGroups.${gi}.options`] ? (
                  <p className="text-xs text-destructive">
                    {errors[`optionGroups.${gi}.options`]}
                  </p>
                ) : null}

                {/* 右端の数値欄は幅が狭く、プレースホルダーの「定員」しか
                    手がかりが無い。空欄の意味は書かないと分からない */}
                <p className="text-xs text-muted-foreground">
                  選択肢ごとの定員があれば右枠に入力できます（空欄の場合、人数制限なし）
                </p>

                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => update(gi, { options: [...group.options, emptyOption()] })}
                >
                  <Plus className="size-4" />
                  選択肢を追加する
                </Button>
              </div>
            )}
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="default"
        onClick={() =>
          onChange([
            ...groups,
            {
              title: '',
              responseType: 'single',
              options: Array.from({ length: INITIAL_OPTIONS }, emptyOption),
            },
          ])
        }
      >
        <Plus className="size-4" />
        追加する
      </Button>
    </div>
  )
}
