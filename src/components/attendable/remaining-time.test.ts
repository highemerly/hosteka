import { describe, expect, it } from 'vitest'

import { formatRemaining } from './remaining-time'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('formatRemaining', () => {
  it('過ぎていれば締切済み', () => {
    expect(formatRemaining(0)).toBe('締切済み')
    expect(formatRemaining(-1)).toBe('締切済み')
  })

  it('1時間を切っても「あと0時間」にならず、分まで出す', () => {
    expect(formatRemaining(45 * MINUTE)).toBe('あと0時間45分')
  })

  it('24時間を切ったら時間と分を出す', () => {
    expect(formatRemaining(5 * HOUR + 12 * MINUTE)).toBe('あと5時間12分')
  })

  it('最後の1分でも「0分」にしない', () => {
    expect(formatRemaining(30_000)).toBe('あと0時間1分')
  })

  it('24時間以上は日と時間', () => {
    expect(formatRemaining(DAY)).toBe('あと1日0時間')
    expect(formatRemaining(3 * DAY + 2 * HOUR + 59 * MINUTE)).toBe('あと3日2時間')
  })
})
