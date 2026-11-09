import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))
// サーバーの種類を外へ問い合わせない
vi.mock('@/lib/instance-platform', () => ({
  enrichServersWithPlatform: vi.fn(async (servers: string[]) =>
    servers.map((server) => ({ server, type: 'mastodon' }))
  ),
}))
// `after()` はリクエストスコープの外では使えない
vi.mock('@/server/notifications/notify', () => ({
  notifyAfter: vi.fn(),
  notifyPreEventPromoted: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { notifyAfter } from '@/server/notifications/notify'
import { POST } from './route'

const HOST = PERSONAS.user.user.id
const TERMS = '写真を公開することがあります'
const AGREED = new Date('2026-10-01T12:00:00+09:00')

const answer = (userId: string, dateOptionId: string, over: Record<string, unknown> = {}) => ({
  userId,
  dateOptionId,
  status: 'available',
  autoRegisterWhenPromoted: true,
  termsAcceptedAt: AGREED,
  user: { platform: 'mastodon', server: 'handon.club' },
  ...over,
})

/** 権限の確認（ガード）も同じ findUnique を引くので、足りる列を全部持たせる */
const PRE_EVENT = {
  id: 'pre_1',
  isDisabled: false,
  creatorId: HOST,
  organizationId: null,
  terms: TERMS as string | null,
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedFediverseServers: null,
  promotedAt: null as Date | null,
  dateOptions: [
    // 12/12 19:00–21:00 JST
    { id: 'd1', startDate: new Date('2026-12-12T10:00:00Z'), endDate: new Date('2026-12-12T12:00:00Z') },
    { id: 'd2', startDate: new Date('2026-12-19T10:00:00Z'), endDate: null },
  ],
  participants: [
    answer('alice', 'd1'),
    answer('bob', 'd1'),
    answer('carol', 'd1', { status: 'maybe' }),
    answer('dave', 'd1', { autoRegisterWhenPromoted: false }),
    answer('erin', 'd1', { termsAcceptedAt: null }),
    answer('alice', 'd2', { status: 'unavailable' }),
  ],
}

const EVENT = {
  title: '忘年会',
  description: '',
  hashtags: [],
  startDate: '2026-12-12',
  startTime: '19:00',
  endDate: '2026-12-12',
  endTime: '21:00',
  location: '',
  fee: '',
  relatedUrl: '',
  terms: TERMS,
  maxParticipants: null as number | null,
  registrationDeadlineTime: '',
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedFediverseServers: [] as string[],
  isPublic: true,
  isHighlighted: true,
  allowMaybe: false,
  allowParticipationRequest: true,
  organizationId: '',
  optionGroups: [],
}

const ctx = { params: Promise.resolve({ id: 'pre_1' }) }

function promote(event: Record<string, unknown> = {}, dateOptionId = 'd1') {
  return POST(
    makeRequest('/api/v1/pre-events/pre_1/promote', {
      method: 'POST',
      body: { dateOptionId, event: { ...EVENT, ...event } },
    }),
    ctx
  )
}

async function json(res: Response) {
  return (await res.json()) as {
    data?: { id: string; registeredCount: number }
    error?: { code: string; message: string; details?: { path: string }[] }
  }
}

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.user)
  vi.mocked(notifyAfter).mockClear()
  prismaMock.preEvent.findUnique.mockResolvedValue(PRE_EVENT)
  prismaMock.$transaction.mockImplementation((fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock))
  prismaMock.event.create.mockResolvedValue({ id: 'evt_new' })
  prismaMock.preEvent.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.eventParticipant.createMany.mockResolvedValue({ count: 2 })
})

describe('POST /api/v1/pre-events/[id]/promote', () => {
  it('候補日の日時でイベントを作り、日程調整を閉じる', async () => {
    const res = await promote()
    expect(res.status).toBe(201)
    expect((await json(res)).data).toEqual({ id: 'evt_new', registeredCount: 2 })

    const created = prismaMock.event.create.mock.calls[0][0].data
    expect(created.startTime).toBe('19:00')
    expect(created.endTime).toBe('21:00')
    expect(created.terms).toBe(TERMS)
    expect(created.creatorId).toBe(HOST)

    expect(prismaMock.preEvent.updateMany).toHaveBeenCalledWith({
      where: { id: 'pre_1', promotedAt: null },
      data: expect.objectContaining({ promotedEventId: 'evt_new', promotedDateOptionId: 'd1' }),
    })
    expect(notifyAfter).toHaveBeenCalledWith('pre-event.promote', expect.any(Function))
  })

  it('○を付けて自動登録を選び、規約に同意した人だけを参加で登録する。同意の時刻は引き継ぐ', async () => {
    await promote()
    const rows = prismaMock.eventParticipant.createMany.mock.calls[0][0].data
    expect(rows).toEqual([
      { eventId: 'evt_new', userId: 'alice', status: 'attending', termsAccepted: true, termsAcceptedAt: AGREED },
      { eventId: 'evt_new', userId: 'bob', status: 'attending', termsAccepted: true, termsAcceptedAt: AGREED },
    ])
  })

  it('定員が自動登録の人数に足りなければ、何も作らずに断る', async () => {
    const res = await promote({ maxParticipants: 1 })
    expect(res.status).toBe(400)
    expect((await json(res)).error?.details?.[0].path).toBe('event.maxParticipants')
    expect(prismaMock.event.create).not.toHaveBeenCalled()
  })

  it('定員がちょうど人数なら作れる', async () => {
    expect((await promote({ maxParticipants: 2 })).status).toBe(201)
  })

  it('日時を候補日から変えると断る', async () => {
    const res = await promote({ startTime: '18:00' })
    expect(res.status).toBe(400)
    expect((await json(res)).error?.details?.map((d) => d.path)).toEqual(['event.startTime'])
    expect(prismaMock.event.create).not.toHaveBeenCalled()
  })

  it('規約を変える・消すと断る', async () => {
    expect((await promote({ terms: '別の規約' })).status).toBe(400)
    expect((await promote({ terms: '' })).status).toBe(400)
  })

  it('規約の無い日程調整に規約を足すと断る', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue({ ...PRE_EVENT, terms: null })
    expect((await promote({ terms: '足した規約' })).status).toBe(400)
  })

  it('規約が無ければ、同意の記録が無い人も登録する', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue({ ...PRE_EVENT, terms: null })
    const res = await promote({ terms: '' })
    expect((await json(res)).data?.registeredCount).toBe(3)
    const rows = prismaMock.eventParticipant.createMany.mock.calls[0][0].data as {
      termsAcceptedAt: Date | null
    }[]
    expect(rows.every((r) => r.termsAcceptedAt === null)).toBe(true)
  })

  it('ほかの日程調整の候補日は選べない', async () => {
    expect((await promote({}, 'd_other')).status).toBe(400)
  })

  it('もうイベントにした日程調整は断る', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue({ ...PRE_EVENT, promotedAt: new Date() })
    const res = await promote()
    expect(res.status).toBe(409)
    expect(prismaMock.event.create).not.toHaveBeenCalled()
  })

  it('同時に2本来て、閉じる更新が0件なら投げて巻き戻す', async () => {
    prismaMock.preEvent.updateMany.mockResolvedValue({ count: 0 })
    const res = await promote()
    expect(res.status).toBe(409)
    expect(prismaMock.eventParticipant.createMany).not.toHaveBeenCalled()
    expect(notifyAfter).not.toHaveBeenCalled()
  })

  it('作成者でもグループの管理者でもない人は断る', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue({ ...PRE_EVENT, creatorId: 'someone' })
    expect((await promote()).status).toBe(403)
  })
})
