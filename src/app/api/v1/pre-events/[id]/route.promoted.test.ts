import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))
vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), isAdminUser: vi.fn() }))
vi.mock('@/lib/permissions', () => ({
  checkPreEventOrganizerPermission: vi.fn(async () => true),
  checkPreEventOwnerPermission: vi.fn(async () => true),
  checkOrgAdminPermission: vi.fn(),
}))
vi.mock('@/server/notifications/notify', () => ({
  notifyAfter: vi.fn(),
  notifyPreEventDeleted: vi.fn(async () => ({ created: 0, folded: 0 })),
  notifyPreEventUpdated: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { notifyPreEventDeleted } from '@/server/notifications/notify'
import { DELETE, PUT } from './route'
import { DELETE as DELETE_ANSWER, POST as ANSWER } from './participate/route'

/**
 * イベントにした日程調整は閉じる。**回答も編集もできない。**
 * 決まったあとで回答や候補日が動くと、イベントの参加者と日程調整の集計が食い違う。
 */

const ID = 'pre_1'
const args = { params: Promise.resolve({ id: ID }) }

const ROW = {
  id: ID,
  title: '忘年会の日程',
  isDisabled: false,
  creatorId: PERSONAS.user.user.id,
  organizationId: null,
  terms: null,
  registrationDeadline: null,
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedFediverseServers: null,
  allowAutoRegistration: false,
  dateOptions: [{ id: 'd1' }],
  promotedAt: new Date('2026-11-01T12:00:00+09:00') as Date | null,
}

const PAYLOAD = {
  title: '忘年会の日程',
  hashtags: [],
  dateOptions: [{ startDate: '2026-12-12T10:00:00.000Z', endDate: null }],
  registrationDeadline: null,
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedFediverseServers: [],
  allowAutoRegistration: false,
  isPublic: true,
  isHighlighted: false,
}

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.user)
  vi.mocked(notifyPreEventDeleted).mockClear()
  prismaMock.preEvent.findUnique.mockResolvedValue(ROW)
  prismaMock.preEventParticipant.findMany.mockResolvedValue([])
  prismaMock.preEvent.delete.mockResolvedValue({ id: ID })
  prismaMock.notification.deleteMany.mockResolvedValue({ count: 0 })
})

describe('イベントにした日程調整', () => {
  it('回答できない', async () => {
    const res = await ANSWER(
      makeRequest(`/api/v1/pre-events/${ID}/participate`, {
        method: 'POST',
        body: { responses: [{ dateOptionId: 'd1', status: 'available' }] },
      }),
      args
    )
    expect(res.status).toBe(409)
    expect(prismaMock.preEventParticipant.deleteMany).not.toHaveBeenCalled()
  })

  it('回答を取り消せない', async () => {
    const res = await DELETE_ANSWER(
      makeRequest(`/api/v1/pre-events/${ID}/participate`, { method: 'DELETE' }),
      args
    )
    expect(res.status).toBe(409)
    expect(prismaMock.preEventParticipant.deleteMany).not.toHaveBeenCalled()
  })

  it('編集できない', async () => {
    const res = await PUT(
      makeRequest(`/api/v1/pre-events/${ID}`, { method: 'PUT', body: PAYLOAD }),
      args
    )
    expect(res.status).toBe(409)
    expect(prismaMock.preEvent.update).not.toHaveBeenCalled()
  })

  /*
    回答した人には「日程が決まった」がもう届いている。そこへ「取り消されました」が
    来ると、イベントまで無くなったように読める。
  */
  it('削除はできるが、回答した人に「取り消されました」を送らない', async () => {
    const res = await DELETE(makeRequest(`/api/v1/pre-events/${ID}`, { method: 'DELETE' }), args)
    expect(res.status).toBe(200)
    expect(prismaMock.preEvent.delete).toHaveBeenCalled()
    expect(notifyPreEventDeleted).not.toHaveBeenCalled()
  })

  it('イベントにしていなければ、削除で「取り消されました」を送る', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue({ ...ROW, promotedAt: null })
    await DELETE(makeRequest(`/api/v1/pre-events/${ID}`, { method: 'DELETE' }), args)
    expect(notifyPreEventDeleted).toHaveBeenCalled()
  })
})
