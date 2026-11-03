import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { session: { updateMany: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { TOUCH_INTERVAL_MS, __resetSessionActivity, touchSession } from './session-activity'

const updateMany = vi.mocked(prisma.session.updateMany)

const NOW = new Date('2026-10-02T12:00:00+09:00')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  __resetSessionActivity()
  updateMany.mockReset()
  updateMany.mockResolvedValue({ count: 1 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('touchSession', () => {
  it('最終利用をいまの時刻へ進める', () => {
    touchSession('sess_1')

    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(updateMany.mock.calls[0][0].data).toEqual({ lastUsedAt: NOW })
  })

  it('1時間以内に進めた行は書き換えない（ほかのポッドが進めた分も含めて DB の条件で止める）', () => {
    touchSession('sess_1')

    expect(updateMany.mock.calls[0][0].where).toEqual({
      id: 'sess_1',
      revokedAt: null,
      lastUsedAt: { lt: new Date(NOW.getTime() - TOUCH_INTERVAL_MS) },
    })
  })

  it('同じセッションは1時間に1回しか DB へ行かない', () => {
    touchSession('sess_1')
    vi.advanceTimersByTime(TOUCH_INTERVAL_MS - 1)
    touchSession('sess_1')
    expect(updateMany).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    touchSession('sess_1')
    expect(updateMany).toHaveBeenCalledTimes(2)
  })

  it('別のセッションは別々に数える', () => {
    touchSession('sess_1')
    touchSession('sess_2')
    expect(updateMany).toHaveBeenCalledTimes(2)
  })

  it('書き込みに失敗しても投げない。次のリクエストでやり直す', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    updateMany.mockRejectedValueOnce(new Error('db down'))

    expect(() => touchSession('sess_1')).not.toThrow()
    // catch が走るのを待つ
    await vi.advanceTimersByTimeAsync(0)
    expect(log).toHaveBeenCalledTimes(1)

    touchSession('sess_1')
    expect(updateMany).toHaveBeenCalledTimes(2)
    log.mockRestore()
  })
})
