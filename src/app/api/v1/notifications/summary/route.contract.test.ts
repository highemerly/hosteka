import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERSONAS, expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { BELL_RECENT, GET } from './route'

const SEEN = new Date('2026-09-18T09:00:00+09:00')

const ROW = {
  id: 'ntf_1',
  kind: 'participation_requested',
  targetType: 'event',
  targetId: 'evt_1',
  payload: JSON.stringify({ title: '花見の会' }),
  occurredAt: new Date('2026-09-18T15:00:00+09:00'),
  repeatCount: 1,
  actor: {
    id: 'user_9',
    username: 'hanako',
    displayName: 'テスト花子',
    avatar: null,
    server: 'example.social',
    platform: 'mastodon',
  },
}

const get = () => GET(makeRequest('/api/v1/notifications/summary'))

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.user)
  prismaMock.user.findUnique.mockResolvedValue({ notificationsSeenAt: SEEN })
  prismaMock.notification.count.mockResolvedValue(3)
  prismaMock.notification.findMany.mockResolvedValue([ROW])
})

describe('GET /api/v1/notifications/summary', () => {
  /** 全ページで叩くものなので、往復を2本にしない */
  it('未読の数と直近の数件を1本で返す', async () => {
    await expectContract(await get())
  })

  it('直近は5件まで', async () => {
    await get()

    expect(prismaMock.notification.findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: 'user_1' },
      orderBy: { occurredAt: 'desc' },
      take: BELL_RECENT,
    })
    expect(BELL_RECENT).toBe(5)
  })

  /** 未読数と行の強調が食い違うと「1件あるのにどれも光っていない」になる */
  it('未読は既読位置より後に起きたものだけを数える', async () => {
    await get()

    expect(prismaMock.notification.count.mock.calls[0][0].where).toEqual({
      userId: 'user_1',
      occurredAt: { gt: SEEN },
    })
  })

  /** 直近には既読のものも並ぶ（読んだ内容をもう一度見られるように） */
  it('直近は未読で絞らない', async () => {
    await get()
    expect(prismaMock.notification.findMany.mock.calls[0][0].where).toEqual({ userId: 'user_1' })
  })

  it('ログインしていなければ 401', async () => {
    vi.mocked(getSession).mockResolvedValue(null)
    expect((await get()).status).toBe(401)
  })
})
