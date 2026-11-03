import { describe, it, vi, beforeEach, expect } from 'vitest'

import { PERSONAS, expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/server/auth/session')>(
    '@/server/auth/session'
  )
  return { ...actual, getSession: vi.fn(), isAdminUser: vi.fn() }
})
vi.mock('@/server/auth/revocation-cache', () => ({
  isRevoked: vi.fn().mockResolvedValue(false),
  markRevokedLocally: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { DELETE } from './route'

const mockGetSession = vi.mocked(getSession)

const ctx = { params: Promise.resolve({ id: 'sess_other' }) }

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(PERSONAS.user)
  prismaMock.session.findFirst.mockResolvedValue({ id: 'sess_other' })
  prismaMock.session.update.mockResolvedValue({ expiresAt: new Date('2026-10-01T00:00:00Z') })
})

describe('DELETE /api/v1/account/sessions/[id]', () => {
  it('自分のセッションを失効させる', async () => {
    await expectContract(await DELETE(makeRequest('/api/v1/account/sessions/sess_other'), ctx))
    expect(prismaMock.session.update.mock.calls[0][0].data.revokedAt).toBeInstanceOf(Date)
  })

  it('自分の行かどうかを必ず確かめる。IDを渡されただけで他人のセッションを切れない', async () => {
    await DELETE(makeRequest('/api/v1/account/sessions/sess_other'), ctx)
    expect(prismaMock.session.findFirst.mock.calls[0][0].where).toEqual({
      id: 'sess_other',
      userId: 'user_1',
      revokedAt: null,
    })
  })

  it('他人のセッションは404。存在を教えない', async () => {
    prismaMock.session.findFirst.mockResolvedValue(null)
    await expectContract(await DELETE(makeRequest('/api/v1/account/sessions/sess_other'), ctx))
    expect(prismaMock.session.update).not.toHaveBeenCalled()
  })

  it('いまの端末はここから切らない。Cookie だけ残って黙って弾かれる', async () => {
    await expectContract(
      await DELETE(makeRequest('/api/v1/account/sessions/sess_user'), {
        params: Promise.resolve({ id: 'sess_user' }),
      })
    )
    expect(prismaMock.session.update).not.toHaveBeenCalled()
  })

  it('未ログインでは401', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.anonymous)
    await expectContract(await DELETE(makeRequest('/api/v1/account/sessions/sess_other'), ctx))
  })
})
