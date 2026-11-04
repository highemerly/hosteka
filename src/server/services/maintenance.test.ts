import { beforeEach, describe, expect, it, vi } from 'vitest'

const purgeOldRecords = vi.fn()
const autoCancelMaybeForAll = vi.fn()
vi.mock('./purge-old-records', () => ({ purgeOldRecords: (now: Date) => purgeOldRecords(now) }))
vi.mock('./auto-cancel-maybe', () => ({ autoCancelMaybeForAll: (now: Date) => autoCancelMaybeForAll(now) }))

import { runMaintenance } from './maintenance'

const NOW = new Date('2026-11-20T12:00:00+09:00')

beforeEach(() => {
  purgeOldRecords.mockReset().mockResolvedValue({ deletedSessions: 1, rewrittenUsers: 0, deletedNotifications: 2, cutoff: 'c' })
  autoCancelMaybeForAll.mockReset().mockResolvedValue({ processedEvents: 3, totalCancelled: 4, results: [{ eventId: 'e' }] })
})

describe('runMaintenance', () => {
  /*
    cron はこの1本だけ。保存期間の削除と、締切を過ぎた「未定」のキャンセルの両方を、
    同じ時刻で回す。
  */
  it('保存期間の削除と、締切を過ぎた未定のキャンセルを、同じ時刻で回す', async () => {
    const result = await runMaintenance(NOW)

    expect(purgeOldRecords).toHaveBeenCalledWith(NOW)
    expect(autoCancelMaybeForAll).toHaveBeenCalledWith(NOW)
    // イベントごとの内訳は返さない（cron のログには件数があれば足りる）
    expect(result).toEqual({
      purge: { deletedSessions: 1, rewrittenUsers: 0, deletedNotifications: 2, cutoff: 'c' },
      autoCancel: { processedEvents: 3, totalCancelled: 4 },
    })
  })
})
