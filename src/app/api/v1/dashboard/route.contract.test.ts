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

const USER_ROW = {
  id: 'user_1',
  username: 'taro',
  displayName: 'テスト太郎',
  avatar: null,
  server: 'example.social',
  platform: 'mastodon',
  hasWritePermission: true,
}

const EVENT_ROW = {
  id: 'evt_1',
  title: 'Fediverse 交流会',
  hashtags: JSON.stringify(['fediverse交流会']),
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

const PRE_EVENT_ROW = {
  id: 'pre_1',
  title: '次の交流会の日程',
  location: null,
  fee: null,
  registrationDeadline: null,
  creator: {
    id: 'user_1',
    username: 'taro',
    displayName: 'テスト太郎',
    avatar: null,
    server: 'example.social',
    platform: 'mastodon',
  },
  organization: null,
  dateOptions: [
    { id: 'opt_1', startDate: new Date('2026-10-01T10:00:00Z'), endDate: null },
  ],
  participants: [],
}

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(PERSONAS.user)
  prismaMock.user.findUnique.mockResolvedValue(USER_ROW)
  prismaMock.event.findMany.mockResolvedValue([])
  prismaMock.preEvent.findMany.mockResolvedValue([])
  prismaMock.preEventParticipant.groupBy.mockResolvedValue([
    { preEventId: 'pre_2' },
    { preEventId: 'pre_1' },
  ])
})

describe('GET /api/v1/dashboard', () => {
  it('アカウント・近いイベント・最近の日程調整をまとめて返す', async () => {
    prismaMock.event.findMany.mockResolvedValue([EVENT_ROW])
    prismaMock.preEvent.findMany.mockResolvedValue([PRE_EVENT_ROW])
    await expectContract(await GET(makeRequest('/api/v1/dashboard')))
  })

  it('未ログインでは401', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.anonymous)
    await expectContract(await GET(makeRequest('/api/v1/dashboard')))
  })

  it('セッションはあるのにユーザーの行が無いときも401。退会直後の取り残しで500にしない', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    await expectContract(await GET(makeRequest('/api/v1/dashboard')))
  })

  it('アカウントは公開してよい列だけを取る。accessToken や ipAddresses は読まない', async () => {
    await GET(makeRequest('/api/v1/dashboard'))
    expect(prismaMock.user.findUnique.mock.calls[0][0].select).toEqual({
      id: true,
      username: true,
      displayName: true,
      avatar: true,
      server: true,
      platform: true,
      hasWritePermission: true,
    })
  })

  it('近いイベントは主催と参加をまとめ、開催日の近い順に数件だけ取る', async () => {
    await GET(makeRequest('/api/v1/dashboard'))
    const args = prismaMock.event.findMany.mock.calls[0][0]
    expect(args.orderBy).toEqual({ startDate: 'asc' })
    // 広い画面に出るのは2件。狭い画面は2件目を隠すだけで、読む件数は変えない
    expect(args.take).toBe(2)

    const conditions = args.where.AND as Record<string, unknown>[]
    // 中止したイベントは出さない（行かない予定で埋まると次の予定が読めない）
    expect(conditions).toContainEqual({ status: { not: 'cancelled' } })
    const mine = conditions.find(
      (c) => 'OR' in c && JSON.stringify(c).includes('creatorId')
    ) as { OR: Record<string, unknown>[] }
    expect(mine.OR).toHaveLength(2)
  })

  it('日程調整は「最後に回答した順」に数件。開催日では並べない', async () => {
    await GET(makeRequest('/api/v1/dashboard'))
    const args = prismaMock.preEventParticipant.groupBy.mock.calls[0][0]
    expect(args.by).toEqual(['preEventId'])
    expect(args.where).toEqual({ userId: 'user_1' })
    // 回答は「候補日 × 人」で増えるので、日程調整ごとにまとめてから並べる
    expect(args.orderBy).toEqual({ _max: { createdAt: 'desc' } })
    // イベント側と同じ件数
    expect(args.take).toBe(2)
  })

  it('`in` で取った日程調整を回答の新しい順に並べ直す', async () => {
    prismaMock.preEvent.findMany.mockResolvedValue([
      { ...PRE_EVENT_ROW, id: 'pre_1' },
      { ...PRE_EVENT_ROW, id: 'pre_2' },
    ])
    const body = await (await GET(makeRequest('/api/v1/dashboard'))).json()
    expect(body.data.recentPreEvents.map((p: { id: string }) => p.id)).toEqual([
      'pre_2',
      'pre_1',
    ])
  })

  it('管理者が無効にした日程調整は出さない', async () => {
    await GET(makeRequest('/api/v1/dashboard'))
    expect(prismaMock.preEvent.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['pre_2', 'pre_1'] },
      isDisabled: false,
    })
  })

})
