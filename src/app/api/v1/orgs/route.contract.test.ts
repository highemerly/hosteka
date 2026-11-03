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
import { GET, POST } from './route'

const mockGetSession = vi.mocked(getSession)

const ORG_ROW = {
  id: 'org_1',
  slug: 'my-group',
  name: 'テストグループ',
  description: '説明',
  relatedUrl: null,
  creatorId: 'user_1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  admins: [
    {
      id: 'oa_1',
      role: 'admin',
      user: {
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
    },
  ],
  _count: { events: 3 },
}

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
})

describe('GET /api/v1/orgs', () => {
  it('未ログインは401', async () => {
    mockGetSession.mockResolvedValue(null)
    await expectContract(await GET(makeRequest('/api/v1/orgs')))
  })

  it('管理するグループ一覧を返す', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.organization.findMany.mockResolvedValue([ORG_ROW])
    await expectContract(await GET(makeRequest('/api/v1/orgs')))
  })

  it('管理者のユーザー情報に機密が混入しない', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.organization.findMany.mockResolvedValue([ORG_ROW])
    const text = await (await GET(makeRequest('/api/v1/orgs'))).text()
    expect(text).not.toContain('SECRET')
    expect(text).not.toContain('203.0.113.1')
  })
})

describe('POST /api/v1/orgs', () => {
  it('未ログインは401', async () => {
    mockGetSession.mockResolvedValue(null)
    await expectContract(
      await POST(makeRequest('/api/v1/orgs', { method: 'POST', body: { name: 'x' } }))
    )
  })

  it('グループ名が空なら400', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    await expectContract(
      await POST(makeRequest('/api/v1/orgs', { method: 'POST', body: { name: '  ' } }))
    )
  })

  it('不正な形式のグループIDは400', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    await expectContract(
      await POST(
        makeRequest('/api/v1/orgs', { method: 'POST', body: { name: 'g', slug: 'ab' } })
      )
    )
  })

  it('使用済みのグループIDは409', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.organization.findUnique.mockResolvedValue({ id: 'other' })
    await expectContract(
      await POST(
        makeRequest('/api/v1/orgs', { method: 'POST', body: { name: 'g', slug: 'taken-id' } })
      )
    )
  })

  it('作成に成功すると201でグループを返す', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.organization.findUnique.mockResolvedValue(null)
    prismaMock.$transaction.mockResolvedValue(ORG_ROW)
    await expectContract(
      await POST(
        makeRequest('/api/v1/orgs', {
          method: 'POST',
          body: { name: 'テストグループ', slug: 'my-group' },
        })
      )
    )
  })
})
