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

const PRE_EVENT_ROW = {
  id: 'pre_1',
  title: '次の交流会の日程',
  location: '渋谷',
  fee: null,
  registrationDeadline: null,
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
  dateOptions: [{ id: 'opt_1', startDate: new Date('2026-10-01T10:00:00Z'), endDate: null }],
  participants: [],
}

/** where.AND から、渡した判定に合う条件を1つ取り出す */
function findCondition(predicate: (c: Record<string, unknown>) => boolean) {
  const where = prismaMock.preEvent.findMany.mock.calls[0][0].where
  return (where.AND as Record<string, unknown>[]).find(predicate)
}

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(PERSONAS.user)
  prismaMock.preEvent.count.mockResolvedValue(1)
  prismaMock.preEvent.findMany.mockResolvedValue([])
})

describe('GET /api/v1/pre-events/mine', () => {
  it('一覧とページ情報を返す', async () => {
    prismaMock.preEvent.findMany.mockResolvedValue([PRE_EVENT_ROW])
    await expectContract(await GET(makeRequest('/api/v1/pre-events/mine')))
  })

  it('未ログインでは401', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.anonymous)
    await expectContract(await GET(makeRequest('/api/v1/pre-events/mine')))
  })

  it('既定では主催と回答の両方を返す', async () => {
    await GET(makeRequest('/api/v1/pre-events/mine'))
    const mine = findCondition(
      (c) => 'OR' in c && JSON.stringify(c).includes('creatorId')
    ) as { OR: Record<string, unknown>[] }
    expect(mine.OR).toHaveLength(2)
  })

  it('主催はグループ管理者も含む。作成者だけにすると自分のものが消える', async () => {
    await GET(makeRequest('/api/v1/pre-events/mine?role=created'))
    const created = findCondition((c) => 'OR' in c) as { OR: Record<string, unknown>[] }
    expect(created.OR).toContainEqual({ creatorId: 'user_1' })
    expect(created.OR).toContainEqual({
      organization: { admins: { some: { userId: 'user_1' } } },
    })
  })

  it('回答したものは participants で絞る', async () => {
    await GET(makeRequest('/api/v1/pre-events/mine?role=participating'))
    expect(findCondition((c) => 'participants' in c)).toEqual({
      participants: { some: { userId: 'user_1' } },
    })
  })

  it('終わったかどうかは候補日で決める。日程調整に開催日は無い。イベントにしたものは終わった側', async () => {
    await GET(makeRequest('/api/v1/pre-events/mine'))
    const upcoming = findCondition((c) => 'dateOptions' in c) as {
      promotedAt: null
      dateOptions: { some: { startDate: { gte: Date } } }
    }
    expect(upcoming.dateOptions.some.startDate.gte).toBeInstanceOf(Date)
    expect(upcoming.promotedAt).toBeNull()

    resetPrismaMock()
    prismaMock.preEvent.count.mockResolvedValue(0)
    prismaMock.preEvent.findMany.mockResolvedValue([])
    await GET(makeRequest('/api/v1/pre-events/mine?scope=past'))
    // 「これから」の裏返しが終了。NOT を外すと終了だけが出せない
    expect(findCondition((c) => 'NOT' in c)).toEqual({
      NOT: { promotedAt: null, dateOptions: { some: { startDate: expect.any(Object) } } },
    })
  })

  it('公開・ハイライトで絞らない。自分の非公開の日程調整も見える', async () => {
    await GET(makeRequest('/api/v1/pre-events/mine'))
    const where = JSON.stringify(prismaMock.preEvent.findMany.mock.calls[0][0].where)
    expect(where).not.toContain('isPublic')
    expect(where).not.toContain('isHighlighted')
    // 管理者が無効にしたものは自分のものでも出さない
    expect(findCondition((c) => 'isDisabled' in c)).toEqual({ isDisabled: false })
  })

  it('ページ送りは perPage 件ずつ読み飛ばす', async () => {
    await GET(makeRequest('/api/v1/pre-events/mine?page=3&perPage=12'))
    expect(prismaMock.preEvent.findMany.mock.calls[0][0].take).toBe(12)
    expect(prismaMock.preEvent.findMany.mock.calls[0][0].skip).toBe(24)
  })
})
