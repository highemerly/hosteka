import { describe, expect, it } from 'vitest'

import {
  fromDateKey,
  isPastDay,
  isSameDay,
  monthGrid,
  toDateKey,
  weekdayTone,
} from './date-grid'

describe('toDateKey / fromDateKey', () => {
  it('ローカル時刻の年月日をそのまま使う。UTC で組むと日本では1日ずれる', () => {
    // 日本時間の 0時5分。UTC に直すと前日になる
    expect(toDateKey(new Date(2026, 8, 12, 0, 5))).toBe('2026-09-12')
  })

  it('1桁の月日を0埋めする', () => {
    expect(toDateKey(new Date(2026, 0, 3))).toBe('2026-01-03')
  })

  it('往復して同じ日になる', () => {
    expect(toDateKey(fromDateKey('2026-09-12'))).toBe('2026-09-12')
  })
})

describe('monthGrid', () => {
  it('月初の曜日まで null で埋める', () => {
    // 2026-09-01 は火曜（getDay() === 2）
    const cells = monthGrid(2026, 8)
    expect(cells.slice(0, 2)).toEqual([null, null])
    expect(toDateKey(cells[2] as Date)).toBe('2026-09-01')
  })

  it('月の日数だけ日付が入る', () => {
    expect(monthGrid(2026, 8).filter(Boolean)).toHaveLength(30)
    expect(monthGrid(2026, 1).filter(Boolean)).toHaveLength(28)
    // うるう年
    expect(monthGrid(2028, 1).filter(Boolean)).toHaveLength(29)
  })

  it('日曜始まりの月は null を入れない', () => {
    // 2026-02-01 は日曜
    expect(monthGrid(2026, 1)[0]).not.toBeNull()
  })

  it('末尾は埋めない。空の升目に意味はない', () => {
    const cells = monthGrid(2026, 8)
    expect(cells[cells.length - 1]).not.toBeNull()
  })
})

describe('isSameDay', () => {
  it('時刻が違っても同じ日なら true', () => {
    expect(isSameDay(new Date(2026, 8, 12, 1), new Date(2026, 8, 12, 23))).toBe(true)
  })

  it('日が違えば false', () => {
    expect(isSameDay(new Date(2026, 8, 12), new Date(2026, 8, 13))).toBe(false)
  })
})

describe('isPastDay', () => {
  const now = new Date(2026, 8, 12, 15, 0)

  it('今日は過去に含めない。当日の候補は立てられる', () => {
    expect(isPastDay(new Date(2026, 8, 12, 0, 0), now)).toBe(false)
  })

  it('前日は過去', () => {
    expect(isPastDay(new Date(2026, 8, 11), now)).toBe(true)
  })

  it('翌日は過去ではない', () => {
    expect(isPastDay(new Date(2026, 8, 13), now)).toBe(false)
  })
})

describe('weekdayTone', () => {
  it('日曜と土曜だけ色を変える', () => {
    expect(weekdayTone(0)).toBe('sunday')
    expect(weekdayTone(6)).toBe('saturday')
    expect(weekdayTone(3)).toBe('weekday')
  })
})
