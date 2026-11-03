import { describe, expect, it } from 'vitest'

import { isUnread, unreadWhere } from '@/server/notifications/unread'

const SEEN = new Date('2026-09-18T12:00:00+09:00')

describe('未読の判定', () => {
  it('既読位置より後に起きたものが未読', () => {
    expect(isUnread(new Date('2026-09-18T12:00:01+09:00'), SEEN)).toBe(true)
  })

  it('既読位置より前に起きたものは既読', () => {
    expect(isUnread(new Date('2026-09-18T11:59:59+09:00'), SEEN)).toBe(false)
  })

  /**
   * 境界を未読数と行の強調で食い違わせない。
   * 「未読1件と出ているのに、どの行も光っていない」になる
   */
  it('ちょうど同じ時刻は既読にする', () => {
    expect(isUnread(new Date('2026-09-18T12:00:00+09:00'), SEEN)).toBe(false)
  })

  it('where 片も同じ境界（より後だけ）', () => {
    expect(unreadWhere(SEEN)).toEqual({ occurredAt: { gt: SEEN } })
  })
})
