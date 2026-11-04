import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeRequest } from '@/test/contract'

const runMaintenance = vi.fn()
vi.mock('@/server/services/maintenance', () => ({
  runMaintenance: () => runMaintenance(),
}))

const getSession = vi.fn()
vi.mock('@/server/auth/session', () => ({
  getSession: () => getSession(),
  isAdminUser: async () => true,
}))

import { POST } from './route'

/**
 * 定期的な後片付け。**cron の合言葉でしか動かない。**
 * 無認証で開けると、クラスタの中の誰でも保守処理を走らせられる。
 */
const ORIGINAL_ENV = { ...process.env }

const RESULT = {
  purge: { deletedSessions: 3, rewrittenUsers: 1, deletedNotifications: 0, cutoff: 'x' },
  autoCancel: { processedEvents: 2, totalCancelled: 5 },
}

function post(headers: Record<string, string> = {}) {
  return POST(makeRequest('/api/v1/cron/maintenance', { method: 'POST', headers }))
}

beforeEach(() => {
  process.env.CRON_SECRET = 'cron-secret'
  runMaintenance.mockReset()
  runMaintenance.mockResolvedValue(RESULT)
  getSession.mockReset()
  getSession.mockResolvedValue(null)
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('定期的な後片付け', () => {
  it('合言葉を添えれば実行し、結果を返す', async () => {
    const response = await post({ authorization: 'Bearer cron-secret' })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: RESULT })
  })

  it('合言葉が無い・違うときは実行しない', async () => {
    expect((await post()).status).toBe(401)
    expect((await post({ authorization: 'Bearer wrong' })).status).toBe(401)
    expect(runMaintenance).not.toHaveBeenCalled()
  })

  /** セッションは見ない。ログイン済みでも合言葉が要る */
  it('ログインしているだけでは実行しない', async () => {
    getSession.mockResolvedValue({ sessionId: 's', user: { id: 'u', isAdmin: true } })

    expect((await post()).status).toBe(401)
    expect(runMaintenance).not.toHaveBeenCalled()
  })
})
