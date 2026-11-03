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
import { DELETE, PUT } from './route'

const mockGetSession = vi.mocked(getSession)
const mockIsAdmin = vi.mocked(isAdminUser)

const ROW = {
  id: 1,
  type: 'info',
  title: '直したお知らせ',
  body: '本文',
  publishedAt: new Date('2026-06-20T10:30:00.000Z'),
  pinnedUntil: null,
}

const BODY = {
  type: 'info',
  title: '直したお知らせ',
  body: '本文',
  publishedDate: '2026-06-20',
  publishedTime: '19:30',
  pinnedUntilDate: '',
  pinnedUntilTime: '',
}

const params = { params: Promise.resolve({ id: '1' }) }

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockIsAdmin.mockReset()
  mockGetSession.mockResolvedValue(PERSONAS.admin)
  mockIsAdmin.mockResolvedValue(true)
  prismaMock.announcement.findUnique.mockResolvedValue({ id: 1 })
  prismaMock.announcement.update.mockResolvedValue(ROW)
  prismaMock.announcement.delete.mockResolvedValue(ROW)
})

describe('PUT /api/v1/admin/announcements/[id]', () => {
  it('直したものを返す', async () => {
    await expectContract(
      await PUT(
        makeRequest('/api/v1/admin/announcements/ann_1', { method: 'PUT', body: BODY }),
        params
      )
    )
  })

  it('無いものは404（更新しない）', async () => {
    prismaMock.announcement.findUnique.mockResolvedValue(null)
    const response = await PUT(
      makeRequest('/api/v1/admin/announcements/ann_1', { method: 'PUT', body: BODY }),
      params
    )
    expect(response.status).toBe(404)
    expect(prismaMock.announcement.update).not.toHaveBeenCalled()
  })

  it('一般ユーザーは直せない', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    mockIsAdmin.mockResolvedValue(false)
    const response = await PUT(
      makeRequest('/api/v1/admin/announcements/ann_1', { method: 'PUT', body: BODY }),
      params
    )
    expect(response.status).toBe(403)
    expect(prismaMock.announcement.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/v1/admin/announcements/[id]', () => {
  it('消せる', async () => {
    await expectContract(
      await DELETE(
        makeRequest('/api/v1/admin/announcements/ann_1', { method: 'DELETE' }),
        params
      )
    )
  })

  it('無いものは404', async () => {
    prismaMock.announcement.findUnique.mockResolvedValue(null)
    const response = await DELETE(
      makeRequest('/api/v1/admin/announcements/ann_1', { method: 'DELETE' }),
      params
    )
    expect(response.status).toBe(404)
    expect(prismaMock.announcement.delete).not.toHaveBeenCalled()
  })

  it('一般ユーザーは消せない', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    mockIsAdmin.mockResolvedValue(false)
    const response = await DELETE(
      makeRequest('/api/v1/admin/announcements/ann_1', { method: 'DELETE' }),
      params
    )
    expect(response.status).toBe(403)
    expect(prismaMock.announcement.delete).not.toHaveBeenCalled()
  })
})
