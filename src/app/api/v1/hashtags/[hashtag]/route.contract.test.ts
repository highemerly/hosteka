import { describe, it, vi, beforeEach, expect } from 'vitest'

import { expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))

import { GET } from './route'

const ctx = { params: Promise.resolve({ hashtag: 'LT' }) }

beforeEach(() => {
  resetPrismaMock()
})

describe('GET /api/v1/hashtags/[hashtag]', () => {
  it('切り替えごとの件数を返す', async () => {
    prismaMock.event.count.mockResolvedValueOnce(4).mockResolvedValueOnce(9)
    prismaMock.preEvent.count.mockResolvedValue(2)
    await expectContract(await GET(makeRequest('/api/v1/hashtags/LT'), ctx))
  })

  it('一覧と同じ条件で数える。開催予定と終了はイベント、日程調整中は受付中の日程調整', async () => {
    prismaMock.event.count.mockResolvedValue(0)
    prismaMock.preEvent.count.mockResolvedValue(0)
    await GET(makeRequest('/api/v1/hashtags/LT'), ctx)

    const [upcoming, past] = prismaMock.event.count.mock.calls.map(
      (c) => JSON.stringify(c[0].where)
    )
    expect(upcoming).toContain('"gte"')
    expect(past).toContain('"lt"')
    for (const where of [upcoming, past]) expect(where).toContain('\\"LT\\"')

    const preEvent = prismaMock.preEvent.count.mock.calls[0][0].where as { AND: unknown[] }
    expect(preEvent.AND).toContainEqual({ promotedAt: null })
    expect(preEvent.AND).toContainEqual({ hashtags: { contains: '"LT"' } })
  })
})
