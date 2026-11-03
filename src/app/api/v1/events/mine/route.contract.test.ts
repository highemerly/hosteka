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
  endDate: null,
  endTime: null,
  hasStartTime: true,
  hasEndTime: false,
  location: '渋谷',
  fee: null,
  status: 'active',
  maxParticipants: 40,
  registrationDeadlineDate: null,
  registrationDeadlineTime: null,
  creator: {
    id: 'user_1',
    username: 'taro',
    displayName: 'テスト太郎',
    avatar: null,
    server: 'example.social',
    platform: 'mastodon',
    // DTO に混ざってはならない列。serializeUser が落とすことを固定する
    accessToken: 'enc:v1:SECRET',
  },
  organization: null,
  participants: [],
  _count: { participants: 3 },
}

/** where.AND から、渡した判定に合う条件を1つ取り出す */
function findCondition(predicate: (c: Record<string, unknown>) => boolean) {
  const where = prismaMock.event.findMany.mock.calls[0][0].where
  return (where.AND as Record<string, unknown>[]).find(predicate)
}

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(PERSONAS.user)
  prismaMock.event.count.mockResolvedValue(1)
  prismaMock.event.findMany.mockResolvedValue([])
})

describe('GET /api/v1/events/mine', () => {
  it('一覧とページ情報を返す', async () => {
    prismaMock.event.findMany.mockResolvedValue([EVENT_ROW])
    await expectContract(await GET(makeRequest('/api/v1/events/mine')))
  })

  it('未ログインでは401', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.anonymous)
    await expectContract(await GET(makeRequest('/api/v1/events/mine')))
  })

  it('既定では主催と参加の両方を返す', async () => {
    await GET(makeRequest('/api/v1/events/mine'))
    const mine = findCondition((c) => 'OR' in c) as { OR: Record<string, unknown>[] }
    expect(mine.OR).toHaveLength(2)
  })

  it('主催はグループ管理者も含む。作成者だけにすると自分のイベントが消える', async () => {
    await GET(makeRequest('/api/v1/events/mine?role=created'))
    const created = findCondition((c) => 'OR' in c) as { OR: Record<string, unknown>[] }
    expect(created.OR).toContainEqual({ creatorId: 'user_1' })
    expect(created.OR).toContainEqual({
      organization: { admins: { some: { userId: 'user_1' } } },
    })
  })

  it('回答での絞り込みは参加の条件にだけ掛ける', async () => {
    await GET(makeRequest('/api/v1/events/mine?role=participating&status=maybe'))
    expect(findCondition((c) => 'participants' in c)).toEqual({
      participants: { some: { userId: 'user_1', status: 'maybe' } },
    })
  })

  it('主催を見ているときは回答で絞らない。登録していない自分のイベントが消える', async () => {
    await GET(makeRequest('/api/v1/events/mine?role=created&status=maybe'))
    expect(JSON.stringify(prismaMock.event.findMany.mock.calls[0][0].where)).not.toContain(
      'maybe'
    )
  })

  it('中止したイベントで絞らない。自分のものは中止でも出す', async () => {
    await GET(makeRequest('/api/v1/events/mine'))
    expect(findCondition((c) => 'status' in c)).toBeUndefined()
  })

  it('公開・ハイライトで絞らない。自分の非公開イベントも見える', async () => {
    await GET(makeRequest('/api/v1/events/mine'))
    const where = JSON.stringify(prismaMock.event.findMany.mock.calls[0][0].where)
    expect(where).not.toContain('isPublic')
    expect(where).not.toContain('isHighlighted')
    // 管理者が無効にしたものは自分のものでも出さない
    expect(findCondition((c) => 'isDisabled' in c)).toEqual({ isDisabled: false })
  })

  it('開催予定は近い順、終了済みは新しい順に並べる', async () => {
    await GET(makeRequest('/api/v1/events/mine'))
    expect(prismaMock.event.findMany.mock.calls[0][0].orderBy).toEqual({ startDate: 'asc' })

    resetPrismaMock()
    prismaMock.event.count.mockResolvedValue(0)
    prismaMock.event.findMany.mockResolvedValue([])
    await GET(makeRequest('/api/v1/events/mine?scope=past'))
    expect(prismaMock.event.findMany.mock.calls[0][0].orderBy).toEqual({ startDate: 'desc' })
  })

  it('ページ送りは perPage 件ずつ読み飛ばす', async () => {
    await GET(makeRequest('/api/v1/events/mine?page=3&perPage=12'))
    expect(prismaMock.event.findMany.mock.calls[0][0].take).toBe(12)
    expect(prismaMock.event.findMany.mock.calls[0][0].skip).toBe(24)
  })
})
