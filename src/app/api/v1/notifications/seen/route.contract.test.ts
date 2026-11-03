import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { POST } from './route'

const NOW = new Date('2026-09-18T15:00:00+09:00')

const post = () => POST(makeRequest('/api/v1/notifications/seen', { method: 'POST' }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  resetPrismaMock()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.user)
  prismaMock.user.updateMany.mockResolvedValue({ count: 1 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/v1/notifications/seen', () => {
  it('既読位置を今へ進める', async () => {
    const response = await post()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { seenAt: NOW.toISOString() } })
    expect(prismaMock.user.updateMany.mock.calls[0][0].data).toEqual({
      notificationsSeenAt: NOW,
    })
  })

  /** ポッド間で時計がずれていると、古いほうの now で既読が未読に戻る */
  it('既読位置を前に戻さない', async () => {
    await post()

    expect(prismaMock.user.updateMany.mock.calls[0][0].where).toEqual({
      id: 'user_1',
      notificationsSeenAt: { lt: NOW },
    })
  })

  it('自分の行だけを更新する', async () => {
    await post()
    expect(prismaMock.user.updateMany.mock.calls[0][0].where.id).toBe('user_1')
  })

  it('ログインしていなければ 401', async () => {
    vi.mocked(getSession).mockResolvedValue(null)

    expect((await post()).status).toBe(401)
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })
})
