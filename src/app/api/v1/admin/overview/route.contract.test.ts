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

const mockGetSession = vi.mocked(getSession)
const mockIsAdmin = vi.mocked(isAdminUser)

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockIsAdmin.mockReset()
  prismaMock.report.count.mockResolvedValue(2)
  prismaMock.event.count.mockResolvedValue(10)
  prismaMock.preEvent.count.mockResolvedValue(4)
  prismaMock.user.count.mockResolvedValue(30)
  prismaMock.organization.count.mockResolvedValue(3)
  prismaMock.announcement.count.mockResolvedValue(5)
})

describe('GET /api/v1/admin/overview', () => {
  it('管理者には件数を返す', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.admin)
    mockIsAdmin.mockResolvedValue(true)
    await expectContract(await GET(makeRequest('/api/v1/admin/overview')))
  })

  it('通報は未処理だけを数える', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.admin)
    mockIsAdmin.mockResolvedValue(true)
    await GET(makeRequest('/api/v1/admin/overview'))
    expect(prismaMock.report.count).toHaveBeenCalledWith({ where: { status: 'pending' } })
  })

  it('一般ユーザーは 403（画面が「管理者だけ」と案内する）', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    mockIsAdmin.mockResolvedValue(false)
    await expectContract(await GET(makeRequest('/api/v1/admin/overview')))
  })
})
