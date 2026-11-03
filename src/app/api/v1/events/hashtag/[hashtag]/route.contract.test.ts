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

const EVENT_ROW = {
  id: 'evt_1',
  title: 'LT大会',
  hashtags: JSON.stringify(['LT', 'hosteka']),
  // 日付と時刻は別列。DTO はこの2つを合成して返す
  startDate: new Date('2026-09-12T00:00:00Z'),
  startTime: '19:00',
  endDate: null,
  endTime: null,
  hasStartTime: true,
  hasEndTime: false,
  location: null,
  fee: null,
  status: 'active',
  maxParticipants: null,
  registrationDeadlineDate: null,
  registrationDeadlineTime: null,
  creator: {
    id: 'user_1',
    username: 'taro',
    displayName: 'テスト太郎',
    avatar: null,
    server: 'example.social',
    platform: 'mastodon',
    accessToken: 'enc:v1:SECRET',
  },
  organization: null,
  participants: [],
  _count: { participants: 0 },
}

const ctx = { params: Promise.resolve({ hashtag: 'LT' }) }

beforeEach(() => {
  resetPrismaMock()
  prismaMock.event.count.mockResolvedValue(1)
})

describe('GET /api/v1/events/hashtag/[hashtag]', () => {
  it('一覧とページ情報を返す', async () => {
    prismaMock.event.findMany.mockResolvedValue([EVENT_ROW])
    await expectContract(await GET(makeRequest('/api/v1/events/hashtag/LT'), ctx))
  })

  it('引用符ごと一致させる。LT が LT大会 に当たらないため', async () => {
    prismaMock.event.findMany.mockResolvedValue([])
    await GET(makeRequest('/api/v1/events/hashtag/LT'), ctx)

    const where = prismaMock.event.findMany.mock.calls[0][0].where
    expect(where.AND).toContainEqual({ hashtags: { contains: '"LT"' } })
  })

  it('URLエンコードされた日本語タグを復号する', async () => {
    prismaMock.event.findMany.mockResolvedValue([])
    await GET(makeRequest('/api/v1/events/hashtag/%E4%BA%A4%E6%B5%81%E4%BC%9A'), {
      params: Promise.resolve({ hashtag: '%E4%BA%A4%E6%B5%81%E4%BC%9A' }),
    })

    const where = prismaMock.event.findMany.mock.calls[0][0].where
    expect(where.AND).toContainEqual({ hashtags: { contains: '"交流会"' } })
  })

  it('既定は開催予定を近い順', async () => {
    prismaMock.event.findMany.mockResolvedValue([])
    await GET(makeRequest('/api/v1/events/hashtag/LT'), ctx)

    expect(prismaMock.event.findMany.mock.calls[0][0].orderBy).toEqual({ startDate: 'asc' })
  })

  it('past は終了済みを新しい順', async () => {
    prismaMock.event.findMany.mockResolvedValue([])
    await GET(makeRequest('/api/v1/events/hashtag/LT?scope=past'), ctx)

    expect(prismaMock.event.findMany.mock.calls[0][0].orderBy).toEqual({ startDate: 'desc' })
  })

  it('非公開・無効化は出さない', async () => {
    prismaMock.event.findMany.mockResolvedValue([])
    await GET(makeRequest('/api/v1/events/hashtag/LT'), ctx)

    const where = prismaMock.event.findMany.mock.calls[0][0].where
    expect(where.AND).toContainEqual({ isPublic: true })
    expect(where.AND).toContainEqual({ isDisabled: false })
  })

  it('ページ指定が skip に反映される', async () => {
    prismaMock.event.findMany.mockResolvedValue([])
    await GET(makeRequest('/api/v1/events/hashtag/LT?page=3&perPage=12'), ctx)

    expect(prismaMock.event.findMany.mock.calls[0][0].skip).toBe(24)
  })
})
