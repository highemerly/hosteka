import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERSONAS, expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))

import { getSession, isAdminUser } from '@/server/auth/session'
import { GET, PATCH } from './route'

const ID = 'clreportxxxxxxxxxxxxxxxx1'
const args = { params: Promise.resolve({ id: ID }) }

const USER = {
  id: 'user_9',
  username: 'host',
  displayName: '主催さん',
  avatar: null,
  server: 'example.social',
  platform: 'mastodon',
}

const ROW = {
  id: ID,
  reason: 'スパムです',
  status: 'pending',
  adminNote: '確認中',
  reportedAt: new Date('2026-09-01T12:00:00+09:00'),
  resolvedAt: null,
  reporter: { ...USER, id: 'user_1', username: 'taro', displayName: 'テスト太郎' },
  event: {
    id: 'evt_1',
    title: '怪しい交流会',
    createdAt: new Date('2026-08-30T10:00:00+09:00'),
    isPublic: true,
    isDisabled: false,
    description: '本文',
    creator: { ...USER, _count: { events: 3, preEvents: 1 } },
    organization: null,
  },
  preEvent: null,
}

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.admin)
  vi.mocked(isAdminUser).mockResolvedValue(true)
})

/**
 * 通報の詳細。
 *
 * **旧画面は対象の節が丸ごと出ていなかった。** DTO が `target` に畳まれたのに
 * 画面が `report.event` を読んでいた。形そのものを固定する。
 */
describe('GET /api/v1/admin/reports/[id]', () => {
  it('対象を kind 付きの target に畳み、主催者が主催している件数まで返す', async () => {
    prismaMock.report.findUnique.mockResolvedValue(ROW)
    await expectContract(await GET(makeRequest(`/api/v1/admin/reports/${ID}`), args))
  })

  it('無ければ 404', async () => {
    prismaMock.report.findUnique.mockResolvedValue(null)
    const res = await GET(makeRequest(`/api/v1/admin/reports/${ID}`), args)
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/v1/admin/reports/[id]', () => {
  beforeEach(() => {
    prismaMock.report.findUnique.mockResolvedValue({ id: ID, status: 'resolved' })
    prismaMock.report.update.mockResolvedValue(ROW)
  })

  const patch = (body: unknown) =>
    PATCH(makeRequest(`/api/v1/admin/reports/${ID}`, { method: 'PATCH', body }), args)

  it('メモを送らなければメモは触らない（未処理に戻すだけでメモが消えていた）', async () => {
    await patch({ status: 'pending' })
    const data = prismaMock.report.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty('adminNote')
    expect(data).toMatchObject({ status: 'pending', resolvedAt: null })
  })

  it('状態が変わらないメモの保存では、解決した時刻を動かさない', async () => {
    await patch({ status: 'resolved', adminNote: '追記' })
    const data = prismaMock.report.update.mock.calls[0][0].data
    expect(data).toEqual({ status: 'resolved', adminNote: '追記' })
  })

  it('空のメモは null として消す', async () => {
    await patch({ adminNote: '' })
    expect(prismaMock.report.update.mock.calls[0][0].data).toEqual({ adminNote: null })
  })

  it('何も送らなければ 400', async () => {
    const res = await patch({})
    expect(res.status).toBe(400)
    expect(prismaMock.report.update).not.toHaveBeenCalled()
  })
})
