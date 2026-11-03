import { describe, expect, it } from 'vitest'

import { formatOptionRange } from './date-option-label'

/*
  **テストは UTC で回る。オフセットまで書く**（vitest.config.mts）。
  JST の「9月12日 19:00」は UTC の 10:00。
*/
const jst = (value: string) => new Date(`${value}+09:00`).toISOString()

describe('formatOptionRange', () => {
  it('時刻を決めていない候補は空。0時ちょうどを「00:00」と出さない', () => {
    expect(formatOptionRange(jst('2026-09-12T00:00:00'), null)).toBe('')
  })

  it('同じ日の時間帯', () => {
    expect(
      formatOptionRange(jst('2026-09-12T19:00:00'), jst('2026-09-12T21:00:00'))
    ).toBe('19:00–21:00')
  })

  it('終了を決めていなければ「19:00〜」', () => {
    expect(formatOptionRange(jst('2026-09-12T19:00:00'), null)).toBe('19:00〜')
  })

  it('同じ日の0時に終わる候補は、終了を出さない（終了なしと見分けが付かない）', () => {
    expect(
      formatOptionRange(jst('2026-09-12T19:00:00'), jst('2026-09-12T00:00:00'))
    ).toBe('19:00〜')
  })

  it('日をまたぐだけなら「翌」。日付は足さない（1泊の合宿と同じ見え方になる）', () => {
    expect(
      formatOptionRange(jst('2026-09-12T22:00:00'), jst('2026-09-13T02:00:00'))
    ).toBe('22:00–翌02:00')
  })

  /*
    **終了日を出さないと、回答する側には同じ日の 10:00–15:00 に見える。**
    合宿の候補では、何日までなのかが答えを決める。
  */
  it('複数日にわたる候補は終了日まで出す', () => {
    expect(
      formatOptionRange(jst('2026-09-12T10:00:00'), jst('2026-09-14T15:00:00'))
    ).toBe('10:00〜9月14日(月) 15:00')
  })

  it('時刻を決めていない複数日の候補は、終了日だけ出す', () => {
    expect(
      formatOptionRange(jst('2026-09-12T00:00:00'), jst('2026-09-14T00:00:00'))
    ).toBe('〜9月14日(月)')
  })

  it('月をまたいでも終了日を出す', () => {
    expect(
      formatOptionRange(jst('2026-09-30T00:00:00'), jst('2026-10-02T00:00:00'))
    ).toBe('〜10月2日(金)')
  })
})

describe('formatOptionRange（短い書き方）', () => {
  /* 回答ダイアログは日めくり・範囲・3択が横に並ぶ。長い日付だと3択が潰れる */
  it('終了日を「9/14」で出す', () => {
    expect(
      formatOptionRange(jst('2026-09-12T10:00:00'), jst('2026-09-14T15:00:00'), 'short')
    ).toBe('10:00〜9/14 15:00')
  })

  it('時刻を決めていなければ終了日だけ', () => {
    expect(
      formatOptionRange(jst('2026-09-12T00:00:00'), jst('2026-09-14T00:00:00'), 'short')
    ).toBe('〜9/14')
  })

  it('同じ日の候補は長いほうと同じ（日付を出さないので違いが無い）', () => {
    const args = [jst('2026-09-12T19:00:00'), jst('2026-09-12T21:00:00')] as const
    expect(formatOptionRange(...args, 'short')).toBe(formatOptionRange(...args))
  })
})
