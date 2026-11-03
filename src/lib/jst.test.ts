import { describe, expect, it } from 'vitest'

import {
  formatJstDate,
  formatJstDateTime,
  formatJstTime,
  jstParts,
  toJstDateInput,
  toJstIso,
  toJstTimeInput,
  toJstWallClock,
} from './jst'

/**
 * JST の日時。
 *
 * **どのテストも「実行環境のタイムゾーンに依らないこと」を見ている。**
 * ここが環境依存だと、開発機（JST）では通って本番（UTC）で落ちる、
 * という一番たちの悪い形になる。だから期待値は UTC で書いた入力に対する
 * JST の読みで固定してある。
 */

// UTC 2026-09-12T10:00:00Z = JST 2026-09-12 19:00
const EVENING = new Date('2026-09-12T10:00:00Z')
// UTC 2026-09-12T16:30:00Z = JST 2026-09-13 01:30（日付がまたぐ）
const CROSSES_MIDNIGHT = new Date('2026-09-12T16:30:00Z')
// UTC 2026-09-12T15:00:00Z = JST 2026-09-13 00:00（ちょうど深夜0時）
const MIDNIGHT = new Date('2026-09-12T15:00:00Z')

describe('jstParts', () => {
  it('UTC の瞬間を JST の部品として読む', () => {
    expect(jstParts(EVENING)).toEqual({
      year: 2026,
      month: 9,
      day: 12,
      hour: 19,
      minute: 0,
      second: 0,
    })
  })

  it('日付をまたぐ時刻も正しく繰り上がる', () => {
    expect(jstParts(CROSSES_MIDNIGHT)).toMatchObject({ day: 13, hour: 1, minute: 30 })
  })

  /*
    深夜0時は 24 ではなく 0。`hour12: false` だけだと ICU の版によって
    24 になることがあり、日付ごとの集計が静かにずれる。
  */
  it('深夜0時の時は 24 ではなく 0', () => {
    expect(jstParts(MIDNIGHT)).toMatchObject({ day: 13, hour: 0 })
  })

  it('ISO 文字列でも Date でも同じに読む', () => {
    expect(jstParts('2026-09-12T10:00:00Z')).toEqual(jstParts(EVENING))
  })
})

describe('formatJst*', () => {
  it('日時は JST で出す', () => {
    expect(formatJstDateTime(EVENING)).toBe('2026/9/12 19:00:00')
  })

  it('日付は JST で出す', () => {
    expect(formatJstDate(EVENING)).toBe('2026/9/12')
  })

  it('時刻は JST で出す', () => {
    expect(formatJstTime(EVENING)).toBe('19:00')
  })

  it('形は options で変えられる', () => {
    expect(formatJstDate(EVENING, { year: 'numeric', month: 'long', day: 'numeric' })).toBe(
      '2026年9月12日'
    )
  })

  /*
    **時刻帯だけは呼び出し側に上書きさせない。**
    `options` を後ろに広げていると、うっかり別の時刻帯を渡せてしまい、
    「ここだけ UTC」という一番見つけにくい形になる。
  */
  it('options で時刻帯を上書きできない', () => {
    const forced = formatJstDateTime(EVENING, {
      timeZone: 'America/New_York',
    } as Intl.DateTimeFormatOptions)
    expect(forced).toBe('2026/9/12 19:00:00')
  })
})

describe('入力欄向けの文字列', () => {
  it('date 入力は YYYY-MM-DD', () => {
    expect(toJstDateInput(EVENING)).toBe('2026-09-12')
    expect(toJstDateInput(CROSSES_MIDNIGHT)).toBe('2026-09-13')
  })

  it('time 入力は HH:mm（0埋め）', () => {
    expect(toJstTimeInput(EVENING)).toBe('19:00')
    expect(toJstTimeInput(MIDNIGHT)).toBe('00:00')
  })

  it('ISO 8601 は +09:00 付きで、日付がまたいでも JST の暦日になる', () => {
    expect(toJstIso(EVENING)).toBe('2026-09-12T19:00:00+09:00')
    expect(toJstIso(CROSSES_MIDNIGHT)).toBe('2026-09-13T01:30:00+09:00')
    expect(new Date(toJstIso(CROSSES_MIDNIGHT)).getTime()).toBe(CROSSES_MIDNIGHT.getTime())
  })
})

describe('toJstWallClock', () => {
  /*
    既存の `toJST` が守ってきた約束: **ローカル getter で JST の部品が読める。**
    実装依存の文字列解釈（`new Date('9/12/2026, 7:00:00 PM')`）を
    やめたあとも、この約束は変えていない。
  */
  it('ローカル getter で JST の部品が読める', () => {
    const wall = toJstWallClock(EVENING)
    expect(wall.getFullYear()).toBe(2026)
    expect(wall.getMonth()).toBe(8) // 0始まり
    expect(wall.getDate()).toBe(12)
    expect(wall.getHours()).toBe(19)
    expect(wall.getMinutes()).toBe(0)
  })

  it('ミリ秒を落とさない（旧実装は落としていた）', () => {
    expect(toJstWallClock(new Date('2026-09-12T10:00:00.123Z')).getMilliseconds()).toBe(123)
  })
})
