import { describe, it, vi, beforeEach, expect } from 'vitest'

import { PERSONAS, expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { GET } from './route'

const mockGetSession = vi.mocked(getSession)

const EVENT_ROW = {
  id: 'evt_1',
  title: 'Fediverse 交流会',
  hashtags: JSON.stringify(['fediverse交流会']),
  // 日付と時刻は別列。DTO はこの2つを合成して返す
  startDate: new Date('2026-09-12T00:00:00Z'),
  startTime: '19:00',
  endDate: new Date('2026-09-12T00:00:00Z'),
  endTime: '22:00',
  hasStartTime: true,
  hasEndTime: true,
  location: '渋谷',
  fee: '3,000円',
  status: 'active',
  maxParticipants: 40,
  registrationDeadlineDate: new Date('2026-09-10T00:00:00Z'),
  registrationDeadlineTime: '23:59',
  creator: {
    id: 'user_1',
    username: 'taro',
    displayName: 'テスト太郎',
    avatar: null,
    server: 'example.social',
    platform: 'mastodon',
    // Prisma が返しうる機密。DTOに出てはならない
    accessToken: 'enc:v1:SECRET',
    ipAddresses: '["203.0.113.1"]',
  },
  organization: null,
  participants: [
    {
      user: {
        id: 'user_2',
        username: 'hanako',
        displayName: 'テスト花子',
        avatar: null,
        server: 'example.social',
        platform: 'mastodon',
        accessToken: 'enc:v1:SECRET',
      },
    },
  ],
  _count: { participants: 21 },
}

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
})

describe('GET /api/v1/events/sections', () => {
  it('未ログインでも各セクションを返す', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.anonymous)
    prismaMock.event.findMany.mockResolvedValue([EVENT_ROW])
    await expectContract(await GET(makeRequest('/api/v1/events/sections')))
  })

  it('未ログインでは自分のサーバーのセクションを出さない', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.anonymous)
    prismaMock.event.findMany.mockResolvedValue([])
    const body = await (await GET(makeRequest('/api/v1/events/sections'))).json()
    expect(body.data.myServer).toBeNull()
    // 3セクションだけを引く。myServer のクエリは投げない
    expect(prismaMock.event.findMany).toHaveBeenCalledTimes(3)
  })

  it('Fediverse ユーザーには自分のサーバーのセクションを出す', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.event.findMany.mockResolvedValue([EVENT_ROW])
    const body = await (await GET(makeRequest('/api/v1/events/sections'))).json()
    expect(body.data.myServer.server).toBe('example.social')
    expect(prismaMock.event.findMany).toHaveBeenCalledTimes(4)
  })

  it('参加登録済みのイベントは出さない', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.event.findMany.mockResolvedValue([])
    await GET(makeRequest('/api/v1/events/sections'))

    const where = prismaMock.event.findMany.mock.calls[0][0].where
    expect(where.AND).toContainEqual({
      NOT: {
        participants: {
          some: {
            userId: 'user_1',
            status: { in: ['attending', 'maybe', 'participation_request'] },
          },
        },
      },
    })
  })

  it('キャンセル済みは「登録済み」に含めない。戻る道を塞がない', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.event.findMany.mockResolvedValue([])
    await GET(makeRequest('/api/v1/events/sections'))

    const where = prismaMock.event.findMany.mock.calls[0][0].where
    const excluded = where.AND.find(
      (c: Record<string, unknown>) => 'NOT' in c
    ) as { NOT: { participants: { some: { status: { in: string[] } } } } }
    expect(excluded.NOT.participants.some.status.in).not.toContain('cancelled')
    expect(excluded.NOT.participants.some.status.in).not.toContain('not_attending')
  })

  it('主催しているだけのイベントは除外しない。登録できる相手だから', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.event.findMany.mockResolvedValue([])
    await GET(makeRequest('/api/v1/events/sections'))

    const where = prismaMock.event.findMany.mock.calls[0][0].where
    expect(where.AND).not.toContainEqual({ creatorId: { not: 'user_1' } })
  })

  it('非公開・無効化・中止・終了済みは母集合から外す', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.anonymous)
    prismaMock.event.findMany.mockResolvedValue([])
    await GET(makeRequest('/api/v1/events/sections'))

    const where = prismaMock.event.findMany.mock.calls[0][0].where
    expect(where.AND).toContainEqual({ isDisabled: false })
    expect(where.AND).toContainEqual({ isPublic: true })
    expect(where.AND).toContainEqual({ isHighlighted: true })
    expect(where.AND).toContainEqual({ status: { not: 'cancelled' } })
  })
})
