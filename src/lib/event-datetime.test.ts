import { describe, expect, it } from 'vitest'

import { composeDateTime, composeDeadline } from './event-datetime'

/**
 * 開催日時の合成。
 *
 * 日付と時刻は**別の列**に保存されている。片方だけ読むと時刻が落ちる。
 * 実際に、新フォームが日付だけを送るようになって以降、
 * 「19:00 と入力したイベントが 09:00 と表示される」状態になっていた
 * （`startDate` が UTC 0時 = JST 9時のまま返っていた）。
 *
 * さらに編集画面は `startDate` から時刻を読み戻すので、
 * 開いて保存し直すたびに 09:00 が正となり、ずれが定着した。
 */
describe('composeDateTime', () => {
  it('新形式（日付列が UTC 0時）でも時刻列の時刻になる', () => {
    // 新フォームは `new Date('2026-09-12')` を保存する
    const stored = new Date('2026-09-12T00:00:00Z')
    expect(composeDateTime(stored, '19:00', true)).toBe('2026-09-12T10:00:00.000Z')
  })

  it('旧形式（日付列に時刻まで入っている）でも同じ結果になる', () => {
    // 旧フォームは JST ブラウザで `new Date('2026-09-12T19:00')` を保存していた
    const stored = new Date('2026-09-12T10:00:00Z')
    expect(composeDateTime(stored, '19:00', true)).toBe('2026-09-12T10:00:00.000Z')
  })

  it('時刻を指定していないイベントは JST の 0時になる', () => {
    const stored = new Date('2026-09-12T00:00:00Z')
    // JST 9/12 0:00 = UTC 9/11 15:00。日付として読めば 9/12 のまま
    expect(composeDateTime(stored, null, false)).toBe('2026-09-11T15:00:00.000Z')
  })

  it('hasTime が false なら時刻列が残っていても使わない', () => {
    // 時刻の指定をやめても文字列だけ残ることがある
    const stored = new Date('2026-09-12T00:00:00Z')
    expect(composeDateTime(stored, '19:00', false)).toBe('2026-09-11T15:00:00.000Z')
  })

  it('旧形式の日付列を UTC で読んで1日前にずらさない', () => {
    // JST の 9/12 0:00。UTC で日付を取ると 9/11 になる
    const stored = new Date('2026-09-11T15:00:00Z')
    expect(composeDateTime(stored, '10:00', true)).toBe('2026-09-12T01:00:00.000Z')
  })
})

describe('composeDeadline', () => {
  it('時刻未設定なら JST の 23:59 になる', () => {
    expect(composeDeadline(new Date('2026-09-10T00:00:00Z'), null)).toBe(
      '2026-09-10T14:59:00.000Z'
    )
  })

  it('旧形式の締切日でも日付がずれない', () => {
    // JST の 9/10 0:00。UTC で読むと 9/9 になってしまう
    expect(composeDeadline(new Date('2026-09-09T15:00:00Z'), '18:00')).toBe(
      '2026-09-10T09:00:00.000Z'
    )
  })

  it('未設定なら null', () => {
    expect(composeDeadline(null, '18:00')).toBeNull()
  })
})

/*
  時刻列は文字列で、古いデータには `9:00`（0詰めなし）のような値が入りうる。
  **そのまま組むと `Invalid Date` になり、`toISOString()` が投げて
  API が 500 になる。** 時刻が読めないことは、詳細ページ全体が開けない
  理由にはならない。
*/
describe('壊れた時刻列', () => {
  it.each([['9:00'], ['bogus'], ['24:00:00'], [' 19:00']])(
    '開催時刻が %s でも落ちず、時刻なしとして扱う',
    (time) => {
      expect(composeDateTime(new Date('2026-09-12T00:00:00Z'), time, true)).toBe(
        '2026-09-11T15:00:00.000Z'
      )
    }
  )

  it.each([['9:00'], ['bogus']])('締切時刻が %s でも落ちず、23:59 として扱う', (time) => {
    expect(composeDeadline(new Date('2026-09-10T00:00:00Z'), time)).toBe(
      '2026-09-10T14:59:00.000Z'
    )
  })
})
