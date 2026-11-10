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

const PRE_EVENT_ROW = {
  id: 'pre_1',
  title: '次のボドゲ会',
  hashtags: JSON.stringify(['ボドゲ', 'hosteka']),
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
    // DTO に混ざってはならない列
    accessToken: 'enc:v1:SECRET',
  },
  organization: null,
  dateOptions: [{ id: 'opt_1', startDate: new Date('2026-12-01T10:00:00Z'), endDate: null }],
  participants: [],
}

const ctx = { params: Promise.resolve({ hashtag: 'ボドゲ' }) }

function whereOf() {
  return prismaMock.preEvent.findMany.mock.calls[0][0].where as { AND: unknown[] }
}

beforeEach(() => {
  resetPrismaMock()
  prismaMock.preEvent.count.mockResolvedValue(1)
  prismaMock.preEvent.findMany.mockResolvedValue([])
})

describe('GET /api/v1/pre-events/hashtag/[hashtag]', () => {
  it('一覧とページ情報を返す', async () => {
    prismaMock.preEvent.findMany.mockResolvedValue([PRE_EVENT_ROW])
    await expectContract(await GET(makeRequest('/api/v1/pre-events/hashtag/ボドゲ'), ctx))
  })

  it('引用符ごと一致させる。ボドゲ が ボドゲ会 に当たらないため', async () => {
    await GET(makeRequest('/api/v1/pre-events/hashtag/ボドゲ'), ctx)
    expect(whereOf().AND).toContainEqual({ hashtags: { contains: '"ボドゲ"' } })
  })

  it('URLエンコードされた日本語タグを復号する', async () => {
    await GET(makeRequest('/api/v1/pre-events/hashtag/%E4%BA%A4%E6%B5%81%E4%BC%9A'), {
      params: Promise.resolve({ hashtag: '%E4%BA%A4%E6%B5%81%E4%BC%9A' }),
    })
    expect(whereOf().AND).toContainEqual({ hashtags: { contains: '"交流会"' } })
  })

  it('受付中だけ。イベントにしたものと、候補日が過ぎたものは出さない', async () => {
    await GET(makeRequest('/api/v1/pre-events/hashtag/ボドゲ'), ctx)
    expect(whereOf().AND).toContainEqual({ promotedAt: null })
    expect(whereOf().AND).toContainEqual({
      dateOptions: { some: { startDate: { gte: expect.any(Date) } } },
    })
  })

  it('非公開・無効化は出さない', async () => {
    await GET(makeRequest('/api/v1/pre-events/hashtag/ボドゲ'), ctx)
    expect(whereOf().AND).toContainEqual({ isPublic: true })
    expect(whereOf().AND).toContainEqual({ isDisabled: false })
  })

  it('ページ指定が skip に反映される', async () => {
    await GET(makeRequest('/api/v1/pre-events/hashtag/ボドゲ?page=3&perPage=12'), ctx)
    expect(prismaMock.preEvent.findMany.mock.calls[0][0].skip).toBe(24)
  })
})
