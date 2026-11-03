import { describe, it, expect } from 'vitest'

import { formatLastActive } from './last-active'

const NOW = '2026-10-02T12:00:00+09:00'

/** NOW から指定した分だけ前の時刻 */
function ago(ms: number): string {
  return new Date(new Date(NOW).getTime() - ms).toISOString()
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('formatLastActive', () => {
  it('1時間より細かくは言わない（記録が1時間に1回しか進まない）', () => {
    expect(formatLastActive(ago(0), NOW)).toBe('1時間以内にアクティブ')
    expect(formatLastActive(ago(59 * MIN), NOW)).toBe('1時間以内にアクティブ')
  })

  it('1日未満は時間で書く', () => {
    expect(formatLastActive(ago(HOUR), NOW)).toBe('約1時間前にアクティブ')
    expect(formatLastActive(ago(23 * HOUR + 59 * MIN), NOW)).toBe('約23時間前にアクティブ')
  })

  it('30日未満は日で書く', () => {
    expect(formatLastActive(ago(DAY), NOW)).toBe('約1日前にアクティブ')
    expect(formatLastActive(ago(3 * DAY + 5 * HOUR), NOW)).toBe('約3日前にアクティブ')
    expect(formatLastActive(ago(29 * DAY), NOW)).toBe('約29日前にアクティブ')
  })

  it('それより前は月で書く', () => {
    expect(formatLastActive(ago(30 * DAY), NOW)).toBe('約1ヶ月前にアクティブ')
    expect(formatLastActive(ago(75 * DAY), NOW)).toBe('約2ヶ月前にアクティブ')
  })

  it('時計のずれで未来の時刻が来ても崩れない', () => {
    expect(formatLastActive(ago(-5 * MIN), NOW)).toBe('1時間以内にアクティブ')
  })
})
