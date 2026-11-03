import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))

const ORIGINAL_URL = process.env.NEXTAUTH_URL
process.env.NEXTAUTH_URL = 'https://hosteka.test'

import sitemap from './sitemap'

afterAll(() => {
  process.env.NEXTAUTH_URL = ORIGINAL_URL
})

beforeEach(() => {
  resetPrismaMock()
  prismaMock.event.findMany.mockResolvedValue([])
  prismaMock.preEvent.findMany.mockResolvedValue([])
  prismaMock.announcement.findMany.mockResolvedValue([])
})

describe('sitemap', () => {
  it('イベントが1件も無くても静的なページは載せる', async () => {
    const urls = (await sitemap()).map((entry) => entry.url)

    expect(urls).toContain('https://hosteka.test')
    expect(urls).toContain('https://hosteka.test/events')
    expect(urls).toContain('https://hosteka.test/pre-events')
    expect(urls).toContain('https://hosteka.test/faq')
  })

  it('ログインが要る画面は載せない。開いてもログイン画面にしかならない', async () => {
    const urls = (await sitemap()).map((entry) => entry.url)

    for (const path of ['/dashboard', '/admin', '/account', '/auth/signin', '/events/create']) {
      expect(urls).not.toContain(`https://hosteka.test${path}`)
    }
  })

  it('公開条件は一覧と同じものを使う。sitemap 経由でだけ索引される事故を防ぐ', async () => {
    await sitemap()

    const where = prismaMock.event.findMany.mock.calls[0][0].where
    expect(where.AND).toContainEqual({ isDisabled: false })
    expect(where.AND).toContainEqual({ isPublic: true })
    expect(where.AND).toContainEqual({ isHighlighted: true })
    expect(where.AND).toContainEqual({ status: { not: 'cancelled' } })

    const preWhere = prismaMock.preEvent.findMany.mock.calls[0][0].where
    expect(preWhere.AND).toContainEqual({ isDisabled: false })
    expect(preWhere.AND).toContainEqual({ isPublic: true })
    expect(preWhere.AND).toContainEqual({ isHighlighted: true })
  })

  it('終わったものは載せない', async () => {
    await sitemap()

    const where = prismaMock.event.findMany.mock.calls[0][0].where
    // endDate があればそれ、無ければ startDate で「まだ先か」を見る
    expect(JSON.stringify(where.AND)).toContain('endDate')

    const preWhere = prismaMock.preEvent.findMany.mock.calls[0][0].where
    expect(JSON.stringify(preWhere.AND)).toContain('dateOptions')
  })

  it('公開イベントを絶対URLで載せ、更新日を添える', async () => {
    const updatedAt = new Date('2026-09-01T12:00:00+09:00')
    prismaMock.event.findMany.mockResolvedValue([{ id: 'evt_1', updatedAt }])

    const entry = (await sitemap()).find((e) => e.url.endsWith('/events/evt_1'))

    expect(entry).toEqual(
      expect.objectContaining({
        url: 'https://hosteka.test/events/evt_1',
        lastModified: updatedAt,
      })
    )
  })
})
