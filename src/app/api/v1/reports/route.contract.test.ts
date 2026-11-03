import { describe, it, vi, beforeEach } from 'vitest'

import { PERSONAS, expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))
vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), isAdminUser: vi.fn() }))

import { getSession, isAdminUser } from '@/server/auth/session'
import { POST } from './route'

const mockGetSession = vi.mocked(getSession)
const mockIsAdmin = vi.mocked(isAdminUser)

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockIsAdmin.mockReset()
})

describe('POST /api/v1/reports', () => {
  it('未ログインは401', async () => {
    mockGetSession.mockResolvedValue(null)
    await expectContract(await POST(makeRequest('/x', { method: 'POST', body: { reason: 'a', eventId: 'c'.repeat(25) } })))
  })

  it('理由が空なら400', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    await expectContract(await POST(makeRequest('/x', { method: 'POST', body: { reason: '  ', eventId: 'c'.repeat(25) } })))
  })

  // DB制約では表現できないのでスキーマで担保している
  it('イベントと日程調整の両方を指定すると400', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    await expectContract(
      await POST(makeRequest('/x', { method: 'POST', body: { reason: 'a', eventId: 'c'.repeat(25), preEventId: 'd'.repeat(25) } }))
    )
  })

  it('どちらも指定しないと400', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    await expectContract(await POST(makeRequest('/x', { method: 'POST', body: { reason: 'a' } })))
  })

  it('存在しないイベントは404', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.event.findUnique.mockResolvedValue(null)
    await expectContract(await POST(makeRequest('/x', { method: 'POST', body: { reason: 'a', eventId: 'c'.repeat(25) } })))
  })

  it('作成に成功すると201', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.event.findUnique.mockResolvedValue({ id: 'ev_1' })
    prismaMock.report.create.mockResolvedValue({ id: 'rep_1' })
    await expectContract(await POST(makeRequest('/x', { method: 'POST', body: { reason: '不適切', eventId: 'c'.repeat(25) } })))
  })
})
