import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))

import { GET } from './route'

/** 2026-06-15 12:00 JST */
const NOW = new Date('2026-06-15T12:00:00+09:00')

const ROWS = [
  {
    id: 1,
    type: 'warning',
    title: 'メンテナンスのお知らせ',
    body: '## 停止する時間',
    publishedAt: new Date('2026-06-14T00:00:00.000Z'),
    pinnedUntil: new Date('2026-06-30T00:00:00.000Z'),
  },
  {
    id: 2,
    type: 'low',
    title: '表記をそろえました',
    body: null,
    publishedAt: new Date('2026-06-13T00:00:00.000Z'),
    pinnedUntil: null,
  },
  {
    id: 3,
    type: 'info',
    title: '去年のお知らせ',
    body: '本文',
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    pinnedUntil: null,
  },
]

beforeEach(() => {
  resetPrismaMock()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  prismaMock.announcement.findMany.mockResolvedValue(ROWS)
})

describe('GET /api/v1/announcements', () => {
  it('公開中のお知らせを新しい順に返す', async () => {
    await expectContract(await GET(makeRequest('/api/v1/announcements')))
  })

  it('予約分は取らない（公開前の題名と本文を配らない）', async () => {
    await GET(makeRequest('/api/v1/announcements'))
    const where = prismaMock.announcement.findMany.mock.calls[0][0].where
    expect(where.publishedAt.lte.getTime()).toBe(NOW.getTime())
  })

  it('バナーには「軽微」と掲載の終わったものを出さない', async () => {
    const response = await GET(makeRequest('/api/v1/announcements?placement=banner'))
    const payload = (await response.json()) as { data: { id: number }[] }
    expect(payload.data.map((a) => a.id)).toEqual([1])
  })

  /*
    バナーは全ページから叩かれる。**CDN が持てる形で返っていること**を
    ここで固定する（`next.config.ts` の除外と合わせて初めて効く）。
  */
  it('公開キャッシュに載る', async () => {
    const response = await GET(makeRequest('/api/v1/announcements?placement=banner'))
    expect(response.headers.get('Cache-Control')).toContain('public')
    expect(response.headers.get('Vary')).toBe('Accept-Encoding')
  })
})
