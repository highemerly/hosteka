import 'server-only'

import type { EventColumns } from './event-write'
import {
  COLUMN_FIELD,
  EVENT_CHANGE_LABELS,
  EXTRA_FIELD,
  type EventChangeExtras,
} from './event-notify-fields'

/**
 * 編集で何が変わったか。**変わった項目の名前**を返す。
 *
 * 空なら通知しない。**それが唯一の「送らない」条件**で、
 * 「知らせる価値があるか」の選り分けはしない（`event-notify-fields.ts` の説明）。
 *
 * 純関数にしてあるのは、ここが黙って壊れると「毎回通知が飛ぶ」か
 * 「二度と飛ばない」のどちらかになり、どちらも画面からは分からないため。
 */

/** 通知に出す選択肢の形。並び順そのものが意味を持つ（画面が順で突き合わせる） */
export type OptionGroupShape = {
  title: string
  /** `single` | `multiple` | `text`。DB からは文字列で来る */
  responseType: string
  options: { name: string; maxParticipants?: number | null }[]
}

export type EventChangeInput = {
  columns: EventColumns
  optionGroups: OptionGroupShape[]
  extras: EventChangeExtras
}

/**
 * 選択肢を1つの文字列にする。
 *
 * **並び順まで含める** — 順番は画面にそのまま出るので、入れ替えも変更。
 * 区切り文字を発明せず JSON に任せる（見出しに区切りと同じ字が入っても壊れない）。
 */
export function optionGroupsSignature(groups: OptionGroupShape[]): string {
  return JSON.stringify(
    groups.map((g) => [
      g.title,
      g.responseType,
      g.options.map((o) => [o.name, o.maxParticipants ?? null]),
    ])
  )
}

/** サーバー名の集合。**並び順は主催者が決めたものではない**ので揃えてから比べる */
function serversSignature(servers: string[]): string {
  return JSON.stringify([...new Set(servers)].sort())
}

/**
 * 値が変わったか。
 *
 * **`Date` は `getTime()` で比べる。** `!==` だと同じ日時の別インスタンスが
 * 常に「変わった」になり、開いて保存しただけで全参加者に通知が飛ぶ。
 */
function differs(before: unknown, after: unknown): boolean {
  if (before instanceof Date || after instanceof Date) {
    const b = before instanceof Date ? before.getTime() : null
    const a = after instanceof Date ? after.getTime() : null
    return b !== a
  }
  return before !== after
}

export function notifiableEventChanges(before: EventChangeInput, after: EventChangeInput): string[] {
  const labels: string[] = []
  const add = (field: keyof typeof EVENT_CHANGE_LABELS) => labels.push(EVENT_CHANGE_LABELS[field])

  // 並びは COLUMN_FIELD の順。同じ名前に畳まれる列があるので最後に重複を落とす
  for (const column of Object.keys(COLUMN_FIELD) as (keyof EventColumns)[]) {
    if (differs(before.columns[column], after.columns[column])) add(COLUMN_FIELD[column])
  }

  for (const key of Object.keys(EXTRA_FIELD) as (keyof EventChangeExtras)[]) {
    const changed =
      key === 'allowedServers'
        ? serversSignature(before.extras.allowedServers) !==
          serversSignature(after.extras.allowedServers)
        : differs(before.extras[key], after.extras[key])
    if (changed) add(EXTRA_FIELD[key])
  }

  if (optionGroupsSignature(before.optionGroups) !== optionGroupsSignature(after.optionGroups)) {
    add('optionGroups')
  }

  return [...new Set(labels)]
}
