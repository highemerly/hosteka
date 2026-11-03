import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { GET } from './route'

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
  vi.mocked(getSession).mockReset()
})

describe('GET /api/v1/home', () => {
  it('看板のイベントを返す', async () => {
    prismaMock.event.findMany.mockResolvedValue([EVENT_ROW])
    await expectContract(await GET(makeRequest('/api/v1/home')))
  })

  it('セッションを見ない。応答が閲覧者で変わらないからキャッシュできる', async () => {
    prismaMock.event.findMany.mockResolvedValue([])
    await GET(makeRequest('/api/v1/home'))

    expect(getSession).not.toHaveBeenCalled()
  })

  it('表示しない統計は引かない', async () => {
    prismaMock.event.findMany.mockResolvedValue([])
    await GET(makeRequest('/api/v1/home'))

    // 画面から実績の節を外した。COUNT を4本引く理由がもう無い
    expect(prismaMock.user.count).not.toHaveBeenCalled()
    expect(prismaMock.event.count).not.toHaveBeenCalled()
    expect(prismaMock.eventParticipant.count).not.toHaveBeenCalled()
    expect(prismaMock.preEvent.count).not.toHaveBeenCalled()
  })

  it('非公開・無効化・表示対象外・中止は看板に出さない', async () => {
    prismaMock.event.findMany.mockResolvedValue([])
    await GET(makeRequest('/api/v1/home'))

    const where = prismaMock.event.findMany.mock.calls[0][0].where
    expect(where.AND).toContainEqual({ isDisabled: false })
    expect(where.AND).toContainEqual({ isPublic: true })
    expect(where.AND).toContainEqual({ isHighlighted: true })
    expect(where.AND).toContainEqual({ status: { not: 'cancelled' } })
  })

  it('看板に出せるものが無ければ空で返す。エラーにしない', async () => {
    prismaMock.event.findMany.mockResolvedValue([])
    const body = await (await GET(makeRequest('/api/v1/home'))).json()

    expect(body.data.featured).toEqual([])
  })
})

describe('公開キャッシュ', () => {
  it('CDN が持ってよい応答として返す。閲覧者で変わらないから', async () => {
    prismaMock.event.findMany.mockResolvedValue([])
    const response = await GET(makeRequest('/api/v1/home'))

    expect(response.headers.get('Cache-Control')).toBe(
      'public, s-maxage=300, stale-while-revalidate=600'
    )
    // Cookie を鍵に混ぜない。同じ中身を人数分持つだけになる
    expect(response.headers.get('Vary')).toBe('Accept-Encoding')
  })

  it('失敗した応答はキャッシュさせない', async () => {
    prismaMock.event.findMany.mockRejectedValue(new Error('boom'))
    const response = await GET(makeRequest('/api/v1/home'))

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })
})
