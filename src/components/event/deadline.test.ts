import { describe, expect, it } from 'vitest'

import { cardUrgency, formatRemaining, isDeadlineSoon, isScarce } from './deadline'

const NOW = new Date('2026-09-01T12:00:00+09:00').getTime()
const iso = (s: string) => new Date(s).toISOString()

describe('formatRemaining', () => {
  it('1日以上なら日と時間を出す', () => {
    expect(formatRemaining(iso('2026-09-03T15:00:00+09:00'), NOW)).toBe('あと2日3時間')
  })

  it('1日未満なら時間だけ', () => {
    expect(formatRemaining(iso('2026-09-01T17:00:00+09:00'), NOW)).toBe('あと5時間')
  })

  it('過ぎていれば締切済み', () => {
    expect(formatRemaining(iso('2026-08-31T12:00:00+09:00'), NOW)).toBe('締切済み')
  })

  it('ちょうど締切時刻も締切済みとして扱う', () => {
    expect(formatRemaining(iso('2026-09-01T12:00:00+09:00'), NOW)).toBe('締切済み')
  })
})

describe('isDeadlineSoon', () => {
  it('7日以内なら近い', () => {
    expect(isDeadlineSoon(iso('2026-09-07T12:00:00+09:00'), NOW)).toBe(true)
  })

  it('7日を超えたら近くない', () => {
    expect(isDeadlineSoon(iso('2026-09-09T12:00:00+09:00'), NOW)).toBe(false)
  })

  it('過ぎたものは近いとは言わない', () => {
    expect(isDeadlineSoon(iso('2026-08-30T12:00:00+09:00'), NOW)).toBe(false)
  })
})

describe('isScarce', () => {
  it('定員の2割以下なら少ない', () => {
    expect(isScarce(8, 40)).toBe(true)
    expect(isScarce(9, 40)).toBe(false)
  })

  it('定員なしなら判定しない', () => {
    expect(isScarce(null, null)).toBe(false)
    expect(isScarce(5, null)).toBe(false)
  })
})

describe('cardUrgency', () => {
  it('残席が少ないときはそちらを優先する', () => {
    expect(
      cardUrgency(
        { deadline: iso('2026-09-03T12:00:00+09:00'), remaining: 3, capacity: 40 },
        NOW
      )
    ).toBe('残り3人')
  })

  it('残席に余裕があり締切が近いなら締切を出す', () => {
    expect(
      cardUrgency(
        { deadline: iso('2026-09-03T15:00:00+09:00'), remaining: 30, capacity: 40 },
        NOW
      )
    ).toBe('回答締切 あと2日3時間')
  })

  it('どちらでもないなら何も出さない', () => {
    expect(
      cardUrgency(
        { deadline: iso('2026-10-01T12:00:00+09:00'), remaining: 30, capacity: 40 },
        NOW
      )
    ).toBeNull()
    expect(cardUrgency({ deadline: null, remaining: null, capacity: null }, NOW)).toBeNull()
  })

  it('定員超過でも負の残席は出さない', () => {
    expect(cardUrgency({ deadline: null, remaining: -2, capacity: 40 }, NOW)).toBe('残り0人')
  })
})
