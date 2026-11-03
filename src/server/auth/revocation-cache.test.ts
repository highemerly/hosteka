import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { session: { findMany: vi.fn(), findUnique: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import {
  __cacheStats,
  __resetRevocationCache,
  isRevoked,
  markRevokedLocally,
} from './revocation-cache'

const findMany = vi.mocked(prisma.session.findMany)
const findUnique = vi.mocked(prisma.session.findUnique)

const FUTURE = new Date('2026-09-01T00:00:00Z')

function row(id: string, revokedAt: string) {
  return { id, expiresAt: FUTURE, revokedAt: new Date(revokedAt) }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-19T00:00:00Z'))
  __resetRevocationCache()
  findMany.mockReset()
  findUnique.mockReset()
  findMany.mockResolvedValue([])
})

afterEach(() => {
  __resetRevocationCache()
  vi.useRealTimers()
})

describe('起動', () => {
  it('最初の判定前に必ず一度読み込む（空集合のまま配信しない）', async () => {
    findMany.mockResolvedValue([row('revoked_1', '2026-08-18T00:00:00Z')] as never)
    expect(await isRevoked('revoked_1')).toBe(true)
    expect(findMany).toHaveBeenCalledTimes(1)
  })

  it('2回目以降はDBを引かない（メモリ判定）', async () => {
    await isRevoked('a')
    await isRevoked('b')
    await isRevoked('c')
    expect(findMany).toHaveBeenCalledTimes(1)
  })

  it('起動時の読み込みに失敗したら次回に再試行する', async () => {
    findMany.mockRejectedValueOnce(new Error('db down'))
    findUnique.mockResolvedValue({ revokedAt: null } as never)
    // 1回目は劣化モードで応答
    expect(await isRevoked('x')).toBe(false)
    expect(findUnique).toHaveBeenCalled()

    // 復旧後は通常経路に戻る
    findMany.mockResolvedValue([row('y', '2026-08-18T00:00:00Z')] as never)
    expect(await isRevoked('y')).toBe(true)
  })
})

describe('差分取得', () => {
  it('watermark をDBが返した revokedAt から進める', async () => {
    findMany.mockResolvedValueOnce([row('s1', '2026-08-18T10:00:00Z')] as never)
    await isRevoked('s1')
    expect(__cacheStats().watermark).toEqual(new Date('2026-08-18T10:00:00Z'))
  })

  it('ポーリングで新しい失効を取り込む', async () => {
    await isRevoked('later')
    expect(await isRevoked('later')).toBe(false)

    findMany.mockResolvedValue([row('later', '2026-08-19T00:00:10Z')] as never)
    await vi.advanceTimersByTimeAsync(31_000)

    expect(await isRevoked('later')).toBe(true)
  })

  /**
   * **`revokedAt` は失効させたポッドの時計で入り、コミットの順とも一致しない。**
   * 10:00 を見て watermark を進めたあとに、09:59 の行が遅れてコミットされる
   * ことがある。watermark ちょうどから取ると、この行を二度と取り込まない。
   */
  it('watermark より手前で遅れてコミットされた失効も取り込む', async () => {
    findMany.mockResolvedValueOnce([row('first', '2026-08-18T10:00:00Z')] as never)
    await isRevoked('first')

    findMany.mockResolvedValue([row('late', '2026-08-18T09:59:00Z')] as never)
    await vi.advanceTimersByTimeAsync(31_000)

    const { where } = findMany.mock.lastCall![0] as { where: { revokedAt: { gt: Date } } }
    expect(where.revokedAt.gt.getTime()).toBeLessThan(new Date('2026-08-18T09:59:00Z').getTime())
    expect(await isRevoked('late')).toBe(true)
    // 手前の行で watermark を戻さない
    expect(__cacheStats().watermark).toEqual(new Date('2026-08-18T10:00:00Z'))
  })

  it('期限切れのエントリは刈られる', async () => {
    const past = new Date('2026-08-19T00:00:00Z')
    findMany.mockResolvedValueOnce([
      { id: 'expired', expiresAt: past, revokedAt: new Date('2026-08-18T00:00:00Z') },
    ] as never)
    await isRevoked('expired')
    vi.setSystemTime(new Date('2026-08-19T00:00:01Z'))
    findMany.mockResolvedValue([])
    await vi.advanceTimersByTimeAsync(31_000)
    expect(__cacheStats().size).toBe(0)
  })
})

describe('劣化モード', () => {
  it('更新が長時間失敗したらDBへ直接問い合わせる', async () => {
    await isRevoked('s')
    findMany.mockRejectedValue(new Error('db down'))
    findUnique.mockResolvedValue({ revokedAt: new Date() } as never)

    // 閾値内は stale なキャッシュで応答する
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await isRevoked('s')).toBe(false)
    expect(findUnique).not.toHaveBeenCalled()

    // 閾値(5分)を超えたらDBに落ちる。open にはしない。
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(await isRevoked('s')).toBe(true)
    expect(findUnique).toHaveBeenCalled()
  })

  it('劣化モードの問い合わせはメモ化される', async () => {
    await isRevoked('s')
    findMany.mockRejectedValue(new Error('db down'))
    findUnique.mockResolvedValue({ revokedAt: null } as never)
    await vi.advanceTimersByTimeAsync(6 * 60_000)

    await isRevoked('memo')
    await isRevoked('memo')
    await isRevoked('memo')
    expect(findUnique).toHaveBeenCalledTimes(1)
  })

  it('復旧すると通常経路に戻る', async () => {
    await isRevoked('s')
    findMany.mockRejectedValue(new Error('db down'))
    findUnique.mockResolvedValue({ revokedAt: null } as never)
    await vi.advanceTimersByTimeAsync(6 * 60_000)
    await isRevoked('s')
    expect(findUnique).toHaveBeenCalled()

    findUnique.mockClear()
    findMany.mockResolvedValue([])
    await vi.advanceTimersByTimeAsync(31_000)
    await isRevoked('s')
    expect(findUnique).not.toHaveBeenCalled()
  })
})

describe('ローカル即時反映', () => {
  it('失効させたポッドでは次のポーリングを待たずに反映される', async () => {
    await isRevoked('mine')
    expect(await isRevoked('mine')).toBe(false)
    markRevokedLocally('mine', FUTURE)
    expect(await isRevoked('mine')).toBe(true)
  })
})
