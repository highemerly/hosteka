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
import { GET } from './route'

const SEEN = new Date('2026-09-18T09:00:00+09:00')

const ROW = {
  id: 'ntf_1',
  kind: 'event_updated',
  targetType: 'event',
  targetId: 'evt_1',
  payload: JSON.stringify({ title: '花見の会', changed: ['日時', '場所'] }),
  occurredAt: new Date('2026-09-18T15:00:00+09:00'),
  repeatCount: 2,
  actor: {
    id: 'user_9',
    username: 'host',
    displayName: '主催さん',
    avatar: null,
    server: 'example.social',
    platform: 'mastodon',
  },
}

const get = (query = '') => GET(makeRequest(`/api/v1/notifications${query}`))

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.user)
  prismaMock.user.findUnique.mockResolvedValue({ notificationsSeenAt: SEEN })
  prismaMock.notification.findMany.mockResolvedValue([ROW])
  prismaMock.notification.count.mockResolvedValue(1)
})

describe('GET /api/v1/notifications', () => {
  it('自分の通知を新しい順で返す', async () => {
    await expectContract(await get())

    expect(prismaMock.notification.findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: 'user_1' },
      orderBy: { occurredAt: 'desc' },
      skip: 0,
      take: 20,
    })
  })

  it('ログインしていなければ 401', async () => {
    vi.mocked(getSession).mockResolvedValue(null)
    expect((await get()).status).toBe(401)
  })

  describe('絞り込み', () => {
    it('分類は kind の集合に展開する', async () => {
      await get('?category=organizer')

      expect(prismaMock.notification.findMany.mock.calls[0][0].where.kind.in).toEqual([
        'participation_requested',
        'participation_registered',
        'participation_cancelled',
        'pre_event_answered',
      ])
    })

    /** 幹事が「参加リクエスト」だけを追えるようにするのが、この機能の中心 */
    it('種別を指定すればその1つに絞る', async () => {
      await get('?category=organizer&kind=participation_requested')

      expect(prismaMock.notification.findMany.mock.calls[0][0].where.kind).toBe(
        'participation_requested'
      )
    })

    /** 選べない組み合わせを送られたときに、黙って広い結果を返さない */
    it('分類に属さない種別を指定されたら何も返さない', async () => {
      await get('?category=role&kind=participation_requested')

      expect(prismaMock.notification.findMany.mock.calls[0][0].where.kind).toEqual({ in: [] })
    })

    it('既定では種別で絞らない', async () => {
      await get()
      expect(prismaMock.notification.findMany.mock.calls[0][0].where).toEqual({ userId: 'user_1' })
    })

    it('知らない分類は 400', async () => {
      expect((await get('?category=あやしい')).status).toBe(400)
    })
  })

  describe('ページ送り', () => {
    it('ページに応じて読み飛ばす', async () => {
      await get('?page=3&perPage=6')

      expect(prismaMock.notification.findMany.mock.calls[0][0]).toMatchObject({
        skip: 12,
        take: 6,
      })
    })

    /** 件数も同じ条件で数える（絞り込むと総数が合わなくなる事故を防ぐ） */
    it('総数は一覧と同じ条件で数える', async () => {
      await get('?category=role')

      expect(prismaMock.notification.count.mock.calls[0][0].where).toEqual(
        prismaMock.notification.findMany.mock.calls[0][0].where
      )
    })
  })
})
