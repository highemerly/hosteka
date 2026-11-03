import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))

import { prismaMock, resetPrismaMock } from '@/test/contract'
import { autoCancelMaybeForEvent } from './auto-cancel-maybe'

beforeEach(resetPrismaMock)

describe('autoCancelMaybeForEvent', () => {
  const event = {
    id: 'ev_1',
    title: 'テストイベント',
    registrationDeadlineDate: new Date('2026-03-01T00:00:00Z'),
    registrationDeadlineTime: '18:00',
    participants: [{ id: 'p1' }, { id: 'p2' }],
  }

  it('期限前は何もしない', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event)
    const result = await autoCancelMaybeForEvent('ev_1', new Date('2026-03-01T08:00:00Z'))
    expect(result).toBeNull()
    expect(prismaMock.eventParticipant.updateMany).not.toHaveBeenCalled()
  })

  it('期限後は未定参加者をキャンセルにする', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event)
    const result = await autoCancelMaybeForEvent('ev_1', new Date('2026-03-02T00:00:00Z'))
    expect(result).toMatchObject({ eventId: 'ev_1', cancelledCount: 2 })
    expect(prismaMock.eventParticipant.updateMany).toHaveBeenCalledWith({
      where: { eventId: 'ev_1', status: 'maybe' },
      data: { status: 'cancelled', cancellationReason: 'auto_cancelled' },
    })
  })

  /*
    日付列には旧形式（JST 0時 = 前日の 15:00Z）の行が残っている。UTC の日付で
    読むと締切が1日前にずれ、画面に出ている締切より早く「未定」が消える。
  */
  describe('旧形式の日付（JST 0時で保存された行）', () => {
    // 3月1日 18:00 JST が締切
    const legacy = { ...event, registrationDeadlineDate: new Date('2026-02-28T15:00:00Z') }

    it('前日の同じ時刻ではまだキャンセルしない', async () => {
      prismaMock.event.findUnique.mockResolvedValue(legacy)
      const result = await autoCancelMaybeForEvent('ev_1', new Date('2026-02-28T10:00:00Z'))
      expect(result).toBeNull()
      expect(prismaMock.eventParticipant.updateMany).not.toHaveBeenCalled()
    })

    it('当日の締切を過ぎたらキャンセルする', async () => {
      prismaMock.event.findUnique.mockResolvedValue(legacy)
      const result = await autoCancelMaybeForEvent('ev_1', new Date('2026-03-01T09:01:00Z'))
      expect(result).toMatchObject({ cancelledCount: 2, deadline: '2026-03-01T09:00:00.000Z' })
    })
  })

  it('期限が未設定なら何もしない', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ ...event, registrationDeadlineDate: null })
    expect(await autoCancelMaybeForEvent('ev_1')).toBeNull()
    expect(prismaMock.eventParticipant.updateMany).not.toHaveBeenCalled()
  })

  it('対象の未定参加者がいなければ書き込まない', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ ...event, participants: [] })
    const result = await autoCancelMaybeForEvent('ev_1', new Date('2026-03-02T00:00:00Z'))
    expect(result).toBeNull()
    expect(prismaMock.eventParticipant.updateMany).not.toHaveBeenCalled()
  })
})
