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
import { GET, POST } from './route'

const mockGetSession = vi.mocked(getSession)
const mockIsAdmin = vi.mocked(isAdminUser)

const ROW = {
  id: 1,
  type: 'warning',
  title: 'メンテナンスのお知らせ',
  body: '## 停止する時間',
  publishedAt: new Date('2026-06-20T10:30:00.000Z'),
  pinnedUntil: new Date('2026-07-02T00:00:00.000Z'),
}

/** 画面が送る形。日時は JST の壁掛け時計で届く */
const BODY = {
  type: 'warning',
  title: 'メンテナンスのお知らせ',
  body: '## 停止する時間',
  publishedDate: '2026-06-20',
  publishedTime: '19:30',
  pinnedUntilDate: '2026-07-02',
  pinnedUntilTime: '09:00',
}

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockIsAdmin.mockReset()
  prismaMock.announcement.findMany.mockResolvedValue([ROW])
  prismaMock.announcement.count.mockResolvedValue(1)
  prismaMock.announcement.create.mockResolvedValue(ROW)
})

function asAdmin() {
  mockGetSession.mockResolvedValue(PERSONAS.admin)
  mockIsAdmin.mockResolvedValue(true)
}

describe('GET /api/v1/admin/announcements', () => {
  it('管理者には予約分も含めて返す', async () => {
    asAdmin()
    await expectContract(await GET(makeRequest('/api/v1/admin/announcements')))
  })

  it('一般ユーザーは403', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    mockIsAdmin.mockResolvedValue(false)
    await expectContract(await GET(makeRequest('/api/v1/admin/announcements')))
  })

  it('未ログインは401', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.anonymous)
    await expectContract(await GET(makeRequest('/api/v1/admin/announcements')))
  })
})

describe('POST /api/v1/admin/announcements', () => {
  it('作成すると201で作ったものを返す', async () => {
    asAdmin()
    await expectContract(
      await POST(makeRequest('/api/v1/admin/announcements', { method: 'POST', body: BODY }))
    )
  })

  /*
    **ここがずれると本番でだけ9時間動く。** 画面は JST の壁掛け時計を送るので、
    `+09:00` を付けて解釈しなければならない（CLAUDE.md「Timezone Handling」）。
    テストは UTC で回るので、落としていれば必ず落ちる。
  */
  it('日時を JST として保存する', async () => {
    asAdmin()
    await POST(makeRequest('/api/v1/admin/announcements', { method: 'POST', body: BODY }))

    const data = prismaMock.announcement.create.mock.calls[0][0].data
    expect(data.publishedAt.toISOString()).toBe('2026-06-20T10:30:00.000Z')
    expect(data.pinnedUntil.toISOString()).toBe('2026-07-02T00:00:00.000Z')
  })

  it('「軽微」にはバナーを降ろす日時を持たせない（効かない値を残さない）', async () => {
    asAdmin()
    await POST(
      makeRequest('/api/v1/admin/announcements', {
        method: 'POST',
        body: { ...BODY, type: 'low' },
      })
    )
    expect(prismaMock.announcement.create.mock.calls[0][0].data.pinnedUntil).toBeNull()
  })

  it('題名が無ければ400', async () => {
    asAdmin()
    await expectContract(
      await POST(
        makeRequest('/api/v1/admin/announcements', {
          method: 'POST',
          body: { ...BODY, title: '  ' },
        })
      )
    )
  })

  it('一般ユーザーは作れない', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    mockIsAdmin.mockResolvedValue(false)
    const response = await POST(
      makeRequest('/api/v1/admin/announcements', { method: 'POST', body: BODY })
    )
    expect(response.status).toBe(403)
    expect(prismaMock.announcement.create).not.toHaveBeenCalled()
  })
})
