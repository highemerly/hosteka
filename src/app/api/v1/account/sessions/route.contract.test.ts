import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest'

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
// 失効キャッシュはプロセス内状態を持つ。ここで見たいのは DB への書き込みだけ
vi.mock('@/server/auth/revocation-cache', () => ({
  isRevoked: vi.fn().mockResolvedValue(false),
  markRevokedLocally: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { DELETE, GET } from './route'

const mockGetSession = vi.mocked(getSession)

const ROW = {
  id: 'sess_user',
  createdAt: new Date('2026-08-01T00:00:00Z'),
  lastUsedAt: new Date('2026-09-09T15:00:00Z'),
  expiresAt: new Date('2026-10-01T00:00:00Z'),
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  ipAddress: '203.0.113.5',
  country: 'JP',
  region: 'Tokyo',
}

/** いまの端末の最終利用は応答した時刻になるので、時計を止める */
const NOW = new Date('2026-09-10T09:00:00+09:00')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  resetPrismaMock()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(PERSONAS.user)
  prismaMock.session.findMany.mockResolvedValue([ROW])
  prismaMock.session.updateMany.mockResolvedValue({ count: 1 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/v1/account/sessions', () => {
  it('ログイン中のセッションを返す。いまの端末には印が付く', async () => {
    prismaMock.session.findMany.mockResolvedValue([
      ROW,
      { ...ROW, id: 'sess_other', ipAddress: null, userAgent: null, country: null, region: null },
    ])
    await expectContract(await GET(makeRequest('/api/v1/account/sessions')))
  })

  it('未ログインでは401', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.anonymous)
    await expectContract(await GET(makeRequest('/api/v1/account/sessions')))
  })

  it('いまの端末の最終利用は応答した時刻。ほかの端末は記録のまま', async () => {
    prismaMock.session.findMany.mockResolvedValue([{ ...ROW, id: 'sess_other' }, ROW])
    const response = await GET(makeRequest('/api/v1/account/sessions'))
    const { data } = await response.json()

    // 並びもいまの端末が先頭
    expect(data.sessions.map((s: { id: string }) => s.id)).toEqual(['sess_user', 'sess_other'])
    expect(data.sessions[0].lastUsedAt).toBe(NOW.toISOString())
    expect(data.sessions[1].lastUsedAt).toBe(ROW.lastUsedAt.toISOString())
  })

  it('ログインした場所も返す。CF を通していなければ null', async () => {
    await GET(makeRequest('/api/v1/account/sessions'))
    const select = prismaMock.session.findMany.mock.calls[0][0].select
    expect(select.country).toBe(true)
    expect(select.region).toBe(true)
  })

  it('失効済みと期限切れは出さない。見えても何もできない', async () => {
    await GET(makeRequest('/api/v1/account/sessions'))
    const where = prismaMock.session.findMany.mock.calls[0][0].where
    expect(where.userId).toBe('user_1')
    expect(where.revokedAt).toBeNull()
    expect(where.expiresAt.gt).toBeInstanceOf(Date)
  })
})

describe('DELETE /api/v1/account/sessions', () => {
  it('この端末以外を失効させる', async () => {
    prismaMock.session.findMany.mockResolvedValue([
      { id: 'sess_other', expiresAt: ROW.expiresAt },
    ])
    await expectContract(await DELETE(makeRequest('/api/v1/account/sessions')))
  })

  it('いまの端末は残す。除外は SQL の条件で書く', async () => {
    prismaMock.session.findMany.mockResolvedValue([
      { id: 'sess_other', expiresAt: ROW.expiresAt },
    ])
    await DELETE(makeRequest('/api/v1/account/sessions'))
    expect(prismaMock.session.updateMany.mock.calls[0][0].where).toEqual({
      userId: 'user_1',
      revokedAt: null,
      NOT: { id: 'sess_user' },
    })
  })

  it('ほかに端末が無ければ何も書かない', async () => {
    prismaMock.session.findMany.mockResolvedValue([])
    await DELETE(makeRequest('/api/v1/account/sessions'))
    expect(prismaMock.session.updateMany).not.toHaveBeenCalled()
  })

  it('未ログインでは401', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.anonymous)
    await expectContract(await DELETE(makeRequest('/api/v1/account/sessions')))
  })
})
