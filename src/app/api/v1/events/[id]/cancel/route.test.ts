import { describe, it, vi, beforeEach, expect } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))
/* `after()` はリクエストスコープの外では使えないので、通知は差し替える */
vi.mock('@/server/notifications/notify', () => ({
  notifyAfter: vi.fn(),
  notifyEventCancelled: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { POST } from './route'

/**
 * 誰がイベントを中止できるか。
 *
 * **幹事とグループのスタッフは編集できるが、中止はできない。** どちらも
 * 主催者を手伝う立場で、イベントを畳む判断までは任せない。
 * 権限判定（`checkEventOwnerPermission`）は実物を通す。
 */

const ctx = { params: Promise.resolve({ id: 'evt_1' }) }
const post = () => POST(makeRequest('/api/v1/events/evt_1/cancel', { method: 'POST' }), ctx)

function event(overrides: { creatorId?: string; isOrganizer?: boolean; organizationId?: string }) {
  return {
    id: 'evt_1',
    isDisabled: false,
    creatorId: overrides.creatorId ?? 'user_9',
    organizationId: overrides.organizationId ?? null,
    participants: overrides.isOrganizer ? [{ isOrganizer: true }] : [],
  }
}

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockReset()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.user)
  prismaMock.event.findUniqueOrThrow.mockResolvedValue({ status: 'published', title: '交流会' })
  prismaMock.event.update.mockResolvedValue({ id: 'evt_1', status: 'cancelled' })
})

describe('POST /api/v1/events/[id]/cancel', () => {
  it('主催者は中止できる', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event({ creatorId: PERSONAS.user.user.id }))

    expect((await post()).status).toBe(200)
    expect(prismaMock.event.update).toHaveBeenCalled()
  })

  it('幹事は中止できない', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event({ isOrganizer: true }))

    expect((await post()).status).toBe(403)
    expect(prismaMock.event.update).not.toHaveBeenCalled()
  })

  it('グループ名義のイベントは、グループの管理責任者が中止できる', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event({ organizationId: 'org_1' }))
    prismaMock.organization.findUnique.mockResolvedValue({ creatorId: 'user_8' })
    prismaMock.organizationAdmin.findUnique.mockResolvedValue({ role: 'admin' })

    expect((await post()).status).toBe(200)
  })

  /* スタッフはイベントに対しては幹事と同じ。編集はできるが中止はできない */
  it('グループのスタッフは中止できない', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event({ organizationId: 'org_1' }))
    prismaMock.organization.findUnique.mockResolvedValue({ creatorId: 'user_8' })
    prismaMock.organizationAdmin.findUnique.mockResolvedValue({ role: 'staff' })

    expect((await post()).status).toBe(403)
    expect(prismaMock.event.update).not.toHaveBeenCalled()
  })
})
