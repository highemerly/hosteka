import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERSONAS, expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))

import { getSession, isAdminUser } from '@/server/auth/session'
import { GET } from './route'

const USER_ROW = {
  id: 'user_1',
  username: 'taro',
  displayName: 'テスト太郎',
  avatar: null,
  server: 'example.social',
  platform: 'mastodon',
  lastTermsAcceptedAt: new Date('2026-01-01T09:00:00+09:00'),
  lastLoginAt: new Date('2026-09-10T20:00:00+09:00'),
  ipAddresses: JSON.stringify(['203.0.113.5', '198.51.100.7']),
  createdAt: new Date('2025-12-24T12:00:00+09:00'),
  isAdmin: false,
  // 管理画面でも出してはならない列。select で取らないが、混ざっても落ちることを固定する
  accessToken: 'enc:v1:SECRET',
  _count: { events: 2, preEvents: 1, createdOrganizations: 0, participants: 5 },
}

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.admin)
  vi.mocked(isAdminUser).mockResolvedValue(true)
  prismaMock.user.findMany.mockResolvedValue([USER_ROW])
  prismaMock.user.count.mockResolvedValue(1)
  prismaMock.preEventParticipant.groupBy.mockResolvedValue([
    { userId: 'user_1', preEventId: 'pe_1' },
    { userId: 'user_1', preEventId: 'pe_2' },
  ])
})

describe('GET /api/v1/admin/users', () => {
  it('IP は配列に直し、件数は counts にまとめる。アクセストークンは返さない', async () => {
    await expectContract(await GET(makeRequest('/api/v1/admin/users')))
  })

  it('最終ログインの無い人は、どちらの向きでも末尾', async () => {
    await GET(makeRequest('/api/v1/admin/users?sortBy=lastLoginAt&sortOrder=asc'))
    expect(prismaMock.user.findMany.mock.calls[0][0].orderBy).toEqual({
      lastLoginAt: { sort: 'asc', nulls: 'last' },
    })
  })

  it('検索語は1つの欄から名前・サーバー・IP を引く', async () => {
    await GET(makeRequest('/api/v1/admin/users?search=203.0.113'))
    const where = prismaMock.user.findMany.mock.calls[0][0].where
    expect(where.OR).toContainEqual({ ipAddresses: { contains: '203.0.113' } })
  })
})
