import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))

import { prismaMock, resetPrismaMock } from '@/test/contract'

import { purgeOldRecords, RETENTION_DAYS } from './purge-old-records'

/**
 * 保存期間を過ぎたセッション履歴の削除。
 *
 * プライバシーポリシーは「90日で完全に消去する」と約束している。
 * ここが消さないと、その一文が嘘になる。
 */
const NOW = new Date('2026-09-18T12:00:00+09:00')
const CUTOFF = new Date(NOW.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

beforeEach(() => {
  resetPrismaMock()
  prismaMock.session.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.user.findMany.mockResolvedValue([])
  prismaMock.session.findMany.mockResolvedValue([])
  prismaMock.notification.deleteMany.mockResolvedValue({ count: 0 })
})

describe('保存期間を過ぎた記録の削除', () => {
  it('90日より前に作られ、かつ期限切れのセッション履歴だけを消す', async () => {
    prismaMock.session.deleteMany.mockResolvedValue({ count: 12 })

    const result = await purgeOldRecords(NOW)

    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: CUTOFF }, expiresAt: { lt: NOW } },
    })
    expect(result).toMatchObject({ deletedSessions: 12, cutoff: CUTOFF.toISOString() })
  })

  /**
   * `users.ipAddresses` は「直近5件」を持つだけで日時を持たない。
   * 同じIPから入り続けている人の行には、何年も前に初めて見たIPが残る。
   */
  it('IPの控えを、残ったセッションから作り直す', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'u1', ipAddresses: JSON.stringify(['203.0.113.1', '198.51.100.9']) },
    ])
    prismaMock.session.findMany.mockResolvedValue([
      { ipAddress: '203.0.113.1' },
      { ipAddress: '203.0.113.1' },
      { ipAddress: '203.0.113.7' },
    ])

    const result = await purgeOldRecords(NOW)

    // 重複は畳む。90日より前のIP（198.51.100.9）は残らない
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { ipAddresses: JSON.stringify(['203.0.113.1', '203.0.113.7']) },
    })
    expect(result.rewrittenUsers).toBe(1)
  })

  it('残ったセッションが無ければ、IPの控えを空にする', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u1', ipAddresses: '["203.0.113.1"]' }])

    await purgeOldRecords(NOW)

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { ipAddresses: null },
    })
  })

  it('控えが変わらないユーザーは書き換えない', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u1', ipAddresses: '["203.0.113.1"]' }])
    prismaMock.session.findMany.mockResolvedValue([{ ipAddress: '203.0.113.1' }])

    const result = await purgeOldRecords(NOW)

    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(result.rewrittenUsers).toBe(0)
  })

  it('控えを持たないユーザーは触らない', async () => {
    await purgeOldRecords(NOW)

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { NOT: { ipAddresses: null } },
      select: { id: true, ipAddresses: true },
    })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })
})

describe('保存期間を過ぎた通知の削除', () => {
  /**
   * **`createdAt` で切る。** `occurredAt` は畳むたびに後ろへ動くので、
   * あちらで切ると「ずっと畳まれ続けている1行」が永久に残る
   */
  it('90日より前に作られた通知を消す', async () => {
    prismaMock.notification.deleteMany.mockResolvedValue({ count: 7 })

    const result = await purgeOldRecords(NOW)

    expect(prismaMock.notification.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: CUTOFF } },
    })
    expect(result.deletedNotifications).toBe(7)
  })

  /** 新しい cron を増やさず、セッション履歴の削除に相乗りさせている */
  it('セッション履歴と同じ1回の実行でまとめて消す', async () => {
    await purgeOldRecords(NOW)

    expect(prismaMock.session.deleteMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.notification.deleteMany).toHaveBeenCalledTimes(1)
  })
})
