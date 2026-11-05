import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'token' }) }),
  headers: async () => new Headers(),
}))
vi.mock('./jwt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./jwt')>()),
  verifySession: vi.fn(async () => ({ sub: 'user_1', sid: 'ses_1', adm: false })),
}))
vi.mock('./revocation-cache', () => ({
  isRevoked: vi.fn(async () => false),
  markRevokedLocally: vi.fn(),
}))
vi.mock('./session-activity', () => ({ touchSession: vi.fn() }))
vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))

import { prismaMock, resetPrismaMock } from '@/test/contract'

import { getSession } from './session'

const USER = { id: 'user_1', username: 'alice', server: 'example.social', platform: 'mastodon', isAdmin: false }

beforeEach(() => {
  resetPrismaMock()
})

describe('getSession', () => {
  it('ユーザーを引いてセッションを返す', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...USER, ban: null })

    expect(await getSession()).toEqual({ sessionId: 'ses_1', user: USER })
  })

  /*
    BAN はセッションを失効させてから停止の行を作る。その間に終わったログインの
    セッションは失効の対象から漏れるので、ここで止める。
  */
  it('停止（BAN）された人のセッションは、失効していなくても無効', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...USER, ban: { id: 'ban_1' } })

    expect(await getSession()).toBeNull()
  })

  it('ユーザーが消えていれば無効', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)

    expect(await getSession()).toBeNull()
  })
})
