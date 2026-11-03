import { describe, expect, it } from 'vitest'

import {
  composeScheduledAt,
  scheduleSuggestions,
  toLocalInputValue,
  validateScheduledAt,
} from './schedule'

/** 2026-12-01 12:00 JST */
const now = new Date('2026-12-01T03:00:00.000Z')

describe('composeScheduledAt', () => {
  it('JST として送る。付け忘れるとブラウザの時間帯で9時間ずれる', () => {
    expect(new Date(composeScheduledAt('2026-12-01T21:00')).toISOString()).toBe(
      '2026-12-01T12:00:00.000Z'
    )
  })
})

describe('validateScheduledAt', () => {
  it('未入力は止める', () => {
    expect(validateScheduledAt('', now)).toBe('予約する日時を選んでください')
  })

  it('過去は止める', () => {
    expect(validateScheduledAt('2026-12-01T11:00', now)).toBe('過去の日時は指定できません')
  })

  it('10分以内は止める。サーバーが断る', () => {
    expect(validateScheduledAt('2026-12-01T12:05', now)).toBe(
      'いまから10分より先の時刻を指定してください'
    )
  })

  it('十分に先なら通す', () => {
    expect(validateScheduledAt('2026-12-01T21:00', now)).toBeNull()
  })
})

describe('toLocalInputValue', () => {
  it('JST の datetime-local の値にする', () => {
    expect(toLocalInputValue(new Date('2026-12-01T12:00:00.000Z'))).toBe('2026-12-01T21:00')
  })
})

describe('scheduleSuggestions', () => {
  it('締切の24時間前を出す', () => {
    // 締切: 2026-12-05 23:59 JST
    const suggestions = scheduleSuggestions('2026-12-05T14:59:00.000Z', now)
    expect(suggestions[0].value).toBe('2026-12-04T23:59')
  })

  it('締切が無ければ出さない', () => {
    expect(scheduleSuggestions(null, now)).toEqual([])
  })

  it('24時間前が過ぎていれば出さない。過去は指定できない', () => {
    // 締切: 2026-12-02 00:00 JST（24時間前は既に過ぎている）
    expect(scheduleSuggestions('2026-12-01T15:00:00.000Z', now)).toEqual([])
  })
})
