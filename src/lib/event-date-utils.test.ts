/**
 * event-date-utils.ts のユニットテスト
 */
import { describe, it, expect } from 'vitest'
import { parseDate, parseJSTDateTimeToUTC, toJST } from '@/lib/event-date-utils'

describe('event-date-utils.ts', () => {
  describe('parseDate', () => {
    it('ISO8601 の文字列を Date にする', () => {
      expect(parseDate('2024-06-15T03:00:00Z')?.toISOString()).toBe('2024-06-15T03:00:00.000Z')
    })

    it('空や読めない値は null にする', () => {
      expect(parseDate(null)).toBeNull()
      expect(parseDate(undefined)).toBeNull()
      expect(parseDate('')).toBeNull()
      expect(parseDate('きょう')).toBeNull()
    })
  })

  describe('toJST', () => {
    it('UTC日時をJSTに変換する', () => {
      // UTC 2024-06-15 00:00:00 = JST 2024-06-15 09:00:00
      const utc = new Date('2024-06-15T00:00:00Z')
      const jst = toJST(utc)
      expect(jst.getHours()).toBe(9)
    })

    it('文字列の日時も変換できる', () => {
      const jst = toJST('2024-06-15T00:00:00Z')
      expect(jst.getHours()).toBe(9)
    })
  })

  describe('parseJSTDateTimeToUTC', () => {
    it('日付と時刻を JST として読む', () => {
      expect(parseJSTDateTimeToUTC('2024-06-15', '19:00').toISOString()).toBe(
        '2024-06-15T10:00:00.000Z'
      )
    })

    it('時刻が無ければ JST の 0時にする', () => {
      expect(parseJSTDateTimeToUTC('2024-06-15').toISOString()).toBe('2024-06-14T15:00:00.000Z')
      expect(parseJSTDateTimeToUTC('2024-06-15', null).toISOString()).toBe(
        '2024-06-14T15:00:00.000Z'
      )
    })
  })
})
