import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeRequest } from '@/test/contract'

const purgeOldRecords = vi.fn()
vi.mock('@/server/services/purge-old-records', () => ({
  purgeOldRecords: () => purgeOldRecords(),
}))

const getSession = vi.fn()
vi.mock('@/server/auth/session', () => ({
  getSession: () => getSession(),
  isAdminUser: async () => true,
}))

import { POST } from './route'

/**
 * 保存期間を過ぎた記録の削除。**cron の合言葉でしか動かない。**
 * 無認証で開けると、クラスタの中の誰でも保守処理を走らせられる。
 */
const ORIGINAL_ENV = { ...process.env }

function post(headers: Record<string, string> = {}) {
  return POST(makeRequest('/api/v1/admin/purge-old-records', { method: 'POST', headers }))
}

beforeEach(() => {
  process.env.CRON_SECRET = 'cron-secret'
  purgeOldRecords.mockReset()
  purgeOldRecords.mockResolvedValue({ deletedSessions: 3, rewrittenUsers: 1, cutoff: 'x' })
  getSession.mockReset()
  getSession.mockResolvedValue(null)
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('保存期間を過ぎた記録の削除', () => {
  it('合言葉を添えれば実行し、結果を返す', async () => {
    const response = await post({ authorization: 'Bearer cron-secret' })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: { deletedSessions: 3, rewrittenUsers: 1, cutoff: 'x' },
    })
  })

  it('合言葉が無い・違うときは実行しない', async () => {
    expect((await post()).status).toBe(401)
    expect((await post({ authorization: 'Bearer wrong' })).status).toBe(401)
    expect(purgeOldRecords).not.toHaveBeenCalled()
  })

  /** セッションは見ない。ログイン済みでも合言葉が要る */
  it('ログインしているだけでは実行しない', async () => {
    getSession.mockResolvedValue({ sessionId: 's', user: { id: 'u', isAdmin: true } })

    expect((await post()).status).toBe(401)
    expect(purgeOldRecords).not.toHaveBeenCalled()
  })
})
