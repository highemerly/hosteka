import { describe, expect, it } from 'vitest'

import { formatSchedule } from './event-schedule'

const base = { hasStartTime: true, hasEndTime: true }

describe('formatSchedule', () => {
  it('同じ日なら、終わりは時刻だけ', () => {
    expect(
      formatSchedule({ ...base, startDate: '2026-11-20T19:00:00+09:00', endDate: '2026-11-20T21:30:00+09:00' })
    ).toBe('2026年11月20日(金) 19:00 〜 21:30')
  })

  /*
    **同じ日かは JST で見る。** UTC で見ると、JST の 9:00 より前は前の日になり、
    20日 08:00〜20日 10:00 が「別の日」と判定される（本番のサーバーは UTC）。
  */
  it('JST で同じ日なら、UTC で日付がまたいでも時刻だけ', () => {
    expect(
      formatSchedule({ ...base, startDate: '2026-11-20T08:00:00+09:00', endDate: '2026-11-20T10:00:00+09:00' })
    ).toBe('2026年11月20日(金) 08:00 〜 10:00')
  })

  it('別の日なら、終わりも日付から', () => {
    expect(
      formatSchedule({ ...base, startDate: '2026-11-20T19:00:00+09:00', endDate: '2026-11-21T02:00:00+09:00' })
    ).toBe('2026年11月20日(金) 19:00 〜 2026年11月21日(土) 02:00')
  })

  it('時刻が無ければ日付だけ', () => {
    expect(
      formatSchedule({ startDate: '2026-11-20T00:00:00+09:00', endDate: null, hasStartTime: false, hasEndTime: false })
    ).toBe('2026年11月20日(金)')
  })
})
