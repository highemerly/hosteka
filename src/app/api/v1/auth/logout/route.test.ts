import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/server/auth/session', () => ({
  getSessionClaims: vi.fn(),
  revokeSession: vi.fn(),
}))

import { getSessionClaims, revokeSession } from '@/server/auth/session'
import { makeRequest } from '@/test/contract'

import { POST } from './route'

/**
 * ログアウトは Cookie を読まずに消すので、`SameSite` では止まらない。
 * 別サイトのページから勝手にログアウトさせられないことを見る。
 */

const SITE = 'https://hosteka.test'
const logout = (origin?: string) =>
  POST(makeRequest('/api/v1/auth/logout', { method: 'POST', headers: origin ? { origin } : {} }))

beforeEach(() => {
  vi.stubEnv('NEXTAUTH_URL', SITE)
  vi.mocked(getSessionClaims).mockReset()
  vi.mocked(getSessionClaims).mockResolvedValue({ sessionId: 'ses_1' } as never)
  vi.mocked(revokeSession).mockReset()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/v1/auth/logout', () => {
  it('別のサイトからは403で断り、Cookie も消さず、セッションも失効させない', async () => {
    const res = await logout('https://evil.example')

    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(revokeSession).not.toHaveBeenCalled()
  })

  it('自分のサイトからはセッションを失効させて Cookie を消す', async () => {
    const res = await logout(SITE)

    expect(res.status).toBe(200)
    expect(revokeSession).toHaveBeenCalledWith('ses_1')
    expect(res.headers.get('set-cookie')).toBeTruthy()
  })
})
