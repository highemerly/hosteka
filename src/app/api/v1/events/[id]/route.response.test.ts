import { describe, it, vi, beforeEach, expect } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))
vi.mock('@/server/notifications/notify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/notifications/notify')>()),
  notifyAfter: vi.fn(),
}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { GET, PUT } from './route'

/**
 * **更新の応答は、取得と同じ形で返す。**
 *
 * 以前は Prisma の行をそのまま返していて、列を足すと黙って外へ出る作りだった。
 * 取得と違う形で返すと、同じリソースに契約が2つできる。
 */

const ME = PERSONAS.user.user.id

/** DB の行。DTO に載せない列（`isDisabled`・`creatorId`）も持たせて、漏れないことを見る */
function row() {
  return {
    id: 'evt_1',
    title: 'テストイベント',
    description: null,
    hashtags: null,
    startDate: new Date('2026-09-12T00:00:00+09:00'),
    startTime: null,
    hasStartTime: false,
    endDate: null,
    endTime: null,
    hasEndTime: false,
    location: null,
    fee: null,
    relatedUrl: null,
    terms: null,
    maxParticipants: null,
    registrationDeadlineDate: null,
    registrationDeadlineTime: null,
    status: 'published',
    isDisabled: false,
    isPublic: true,
    isHighlighted: false,
    allowMaybe: true,
    allowParticipationRequest: true,
    isAllowedForFediverse: true,
    isAllowedForDiscord: false,
    isAllowedForTwitter: false,
    allowedFediverseServers: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: new Date('2026-09-01T00:00:00+09:00'),
    updatedAt: new Date('2026-09-01T00:00:00+09:00'),
    creatorId: ME,
    creator: { id: ME, username: 'host', displayName: null, avatar: null, server: 'example.social', platform: 'mastodon' },
    organizationId: null,
    organization: null,
    participants: [
      {
        userId: ME,
        status: 'attending',
        isOrganizer: true,
        comment: null,
        createdAt: new Date('2026-09-01T00:00:00+09:00'),
        user: { id: ME, username: 'host', displayName: null, avatar: null, server: 'example.social', platform: 'mastodon' },
        groupSelections: [],
      },
    ],
    optionGroups: [],
  }
}

/** 編集画面が送る形。行と同じ値（＝何も変えない保存） */
const body = {
  title: 'テストイベント',
  description: '',
  hashtags: [],
  startDate: '2026-09-12',
  startTime: '',
  endTime: '',
  location: '',
  fee: '',
  relatedUrl: '',
  terms: '',
  registrationDeadlineTime: '',
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedFediverseServers: [],
  isPublic: true,
  isHighlighted: false,
  allowMaybe: true,
  allowParticipationRequest: true,
  optionGroups: [],
  organizationId: '',
}

const ctx = { params: Promise.resolve({ id: 'evt_1' }) }

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockReset()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.user)
  prismaMock.$transaction.mockResolvedValue(undefined)
  prismaMock.eventOptionGroup.findMany.mockResolvedValue([])
  prismaMock.event.findUnique.mockResolvedValue(row())
})

describe('PUT /api/v1/events/[id] の応答', () => {
  it('取得（GET）と同じ形で返す', async () => {
    const put = await PUT(makeRequest('/api/v1/events/evt_1', { method: 'PUT', body }), ctx)
    const get = await GET(makeRequest('/api/v1/events/evt_1'), ctx)

    expect(put.status).toBe(200)
    expect(get.status).toBe(200)
    const putData = (await put.json()).data
    const getData = (await get.json()).data
    expect(Object.keys(putData).sort()).toEqual(Object.keys(getData).sort())
    expect(putData).not.toHaveProperty('isDisabled')
    expect(putData).not.toHaveProperty('creatorId')
  })
})
