import { describe, it, vi, beforeEach, expect } from 'vitest'

import { PERSONAS, expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), isAdminUser: vi.fn() }))
vi.mock('@/lib/permissions', () => ({
  checkOrgAdminRolePermission: vi.fn(),
  checkOrgAdminPermission: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { checkOrgAdminRolePermission } from '@/lib/permissions'
import { GET, PUT, DELETE } from './route'

const mockGetSession = vi.mocked(getSession)
const mockOrgAdmin = vi.mocked(checkOrgAdminRolePermission)

const params = Promise.resolve({ orgId: 'my-group' })
const userSel = {
  id: 'user_1',
  username: 'taro',
  displayName: 'テスト太郎',
  avatar: null,
  server: 'example.social',
  platform: 'mastodon',
  accessToken: 'enc:v1:SECRET',
}
const ORG = {
  id: 'org_1',
  slug: 'my-group',
  name: 'テストグループ',
  description: null,
  relatedUrl: null,
  creatorId: 'user_1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  creator: userSel,
  admins: [{ id: 'oa_1', role: 'admin', user: userSel }],
  /*
    一覧カードと同じ形で返すので、**フィクスチャも一覧の select が返す形に
    揃える。** 以前はこのルートだけ独自の形（id/title/startDate/location/
    status/creator/participantCount）で、グループのページだけカードの
    見た目が別物になっていた。
  */
  events: [
    {
      id: 'ev_1',
      title: 'イベント',
      hashtags: '[]',
      startDate: new Date('2026-03-01T00:00:00Z'),
      startTime: '19:00',
      endDate: null,
      endTime: null,
      hasStartTime: true,
      hasEndTime: false,
      location: '東京',
      fee: null,
      status: 'active',
      maxParticipants: null,
      registrationDeadlineDate: null,
      registrationDeadlineTime: null,
      creator: userSel,
      organization: { id: 'org_1', slug: 'my-group', name: 'テストグループ' },
      participants: [{ user: userSel }],
      _count: { participants: 5 },
    },
  ],
  preEvents: [
    {
      id: 'pe_1',
      title: '日程調整',
      location: null,
      fee: null,
      registrationDeadline: null,
      creator: userSel,
      organization: { id: 'org_1', slug: 'my-group', name: 'テストグループ' },
      dateOptions: [
        { id: 'do_1', startDate: new Date('2026-03-10T10:00:00Z'), endDate: null },
      ],
      participants: [{ userId: 'user_1', user: userSel }],
    },
  ],
}

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockOrgAdmin.mockReset()
})

describe('GET /api/v1/orgs/[orgId]', () => {
  it('存在しないグループは404', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null)
    await expectContract(await GET(makeRequest('/api/v1/orgs/none'), { params }))
  })

  it('未ログインでも詳細を返す（公開）', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(ORG)
    await expectContract(await GET(makeRequest('/api/v1/orgs/my-group'), { params }))
  })

  it('機密が混入しない', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(ORG)
    const text = await (await GET(makeRequest('/api/v1/orgs/my-group'), { params })).text()
    expect(text).not.toContain('SECRET')
  })
})

describe('PUT /api/v1/orgs/[orgId]', () => {
  it('未ログインは401', async () => {
    mockGetSession.mockResolvedValue(null)
    await expectContract(
      await PUT(makeRequest('/x', { method: 'PUT', body: { name: 'a' } }), { params })
    )
  })

  it('管理者でなければ403', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.organization.findUnique.mockResolvedValue(ORG)
    mockOrgAdmin.mockResolvedValue(false)
    await expectContract(
      await PUT(makeRequest('/x', { method: 'PUT', body: { name: 'a' } }), { params })
    )
  })

  it('スラッグ重複は409', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    mockOrgAdmin.mockResolvedValue(true)
    prismaMock.organization.findUnique
      .mockResolvedValueOnce(ORG) // guard
      .mockResolvedValueOnce(ORG) // handler の loadOrgBySlug
      .mockResolvedValueOnce({ id: 'other' }) // 重複チェック
    await expectContract(
      await PUT(makeRequest('/x', { method: 'PUT', body: { slug: 'taken-id' } }), { params })
    )
  })
})

describe('DELETE /api/v1/orgs/[orgId]', () => {
  it('管理者でなければ403', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.organization.findUnique.mockResolvedValue(ORG)
    mockOrgAdmin.mockResolvedValue(false)
    await expectContract(await DELETE(makeRequest('/x', { method: 'DELETE' }), { params }))
  })

  it('管理者なら削除できる', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.organization.findUnique.mockResolvedValue(ORG)
    mockOrgAdmin.mockResolvedValue(true)
    prismaMock.organization.delete.mockResolvedValue(ORG)
    await expectContract(await DELETE(makeRequest('/x', { method: 'DELETE' }), { params }))
  })
})
