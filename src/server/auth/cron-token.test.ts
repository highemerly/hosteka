import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { verifyCronToken } from './cron-token'

/**
 * cron から叩くルートの合言葉。**設定していないときに通さない**ことが要。
 * 未設定を「確かめようがないから通す」にすると、開発機の設定漏れが
 * そのまま無認証の保守エンドポイントになる。
 */
const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.CRON_SECRET = 'correct-horse-battery-staple'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('cron の合言葉', () => {
  it('合っていれば通す', () => {
    expect(verifyCronToken('Bearer correct-horse-battery-staple')).toBe(true)
  })

  it('違っていれば通さない', () => {
    expect(verifyCronToken('Bearer wrong')).toBe(false)
    expect(verifyCronToken('Bearer correct-horse-battery-stapl')).toBe(false)
    expect(verifyCronToken('Bearer correct-horse-battery-staplex')).toBe(false)
  })

  it('Bearer の形でなければ通さない', () => {
    expect(verifyCronToken('correct-horse-battery-staple')).toBe(false)
    expect(verifyCronToken('Basic correct-horse-battery-staple')).toBe(false)
    expect(verifyCronToken(null)).toBe(false)
  })

  it('CRON_SECRET が設定されていなければ、何を出しても通さない', () => {
    delete process.env.CRON_SECRET

    expect(verifyCronToken('Bearer correct-horse-battery-staple')).toBe(false)
    expect(verifyCronToken('Bearer ')).toBe(false)
    expect(verifyCronToken(null)).toBe(false)
  })
})
