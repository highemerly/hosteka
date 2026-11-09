import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))
// `after()` はリクエストスコープの外では使えない
vi.mock('@/server/notifications/notify', () => ({
  notifyAfter: vi.fn(),
  notifyPreEventAnswered: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { POST } from './route'

/**
 * 日程調整の参加規約への同意。
 *
 * 以前は規約を回答画面に出すだけで、同意を取っていなかった。イベントにしたときの
 * 自動登録は、ここで記録した同意をイベントの参加へ引き継ぐ。
 */
const PRE_EVENT = {
  id: 'pre_1',
  title: '歓迎会の日程',
  isDisabled: false,
  registrationDeadline: null,
  terms: '当日の写真を公開することがあります' as string | null,
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedFediverseServers: null,
  allowAutoRegistration: true,
  dateOptions: [{ id: 'd1' }, { id: 'd2' }],
}

const ctx = { params: Promise.resolve({ id: 'pre_1' }) }

function post(extra: Record<string, unknown> = {}) {
  return POST(
    makeRequest('/api/v1/pre-events/pre_1/participate', {
      method: 'POST',
      body: {
        responses: [
          { dateOptionId: 'd1', status: 'available' },
          { dateOptionId: 'd2', status: 'unavailable' },
        ],
        ...extra,
      },
    }),
    ctx
  )
}

/** 書き込んだ行の `termsAcceptedAt` */
function writtenConsent() {
  const data = prismaMock.preEventParticipant.createMany.mock.calls[0][0].data as {
    termsAcceptedAt: Date | null
  }[]
  return data.map((row) => row.termsAcceptedAt)
}

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.user)
  prismaMock.preEvent.findUnique.mockResolvedValue(PRE_EVENT)
  prismaMock.preEventParticipant.findMany.mockResolvedValue([])
  prismaMock.preEventParticipant.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.preEventParticipant.createMany.mockResolvedValue({ count: 2 })
})

describe('日程調整の参加規約への同意', () => {
  it('規約があるのに同意しなければ回答できない。既存の回答にも触らない', async () => {
    const res = await post()
    expect(res.status).toBe(400)
    expect(prismaMock.preEventParticipant.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.preEventParticipant.createMany).not.toHaveBeenCalled()
  })

  it('×だけの回答にも同意を求める', async () => {
    const res = await POST(
      makeRequest('/api/v1/pre-events/pre_1/participate', {
        method: 'POST',
        body: {
          responses: [
            { dateOptionId: 'd1', status: 'unavailable' },
            { dateOptionId: 'd2', status: 'unavailable' },
          ],
        },
      }),
      ctx
    )
    expect(res.status).toBe(400)
  })

  it('同意すると、すべての行に同意の時刻を記録する', async () => {
    expect((await post({ termsAccepted: true })).status).toBe(201)
    const consent = writtenConsent()
    expect(consent).toHaveLength(2)
    expect(consent.every((at) => at instanceof Date)).toBe(true)
  })

  it('一度同意した人は、送り直さなくても回答し直せる。同意した時刻は前のまま', async () => {
    const agreedAt = new Date('2026-10-01T12:00:00+09:00')
    prismaMock.preEventParticipant.findMany.mockResolvedValueOnce([
      { dateOptionId: 'd1', status: 'maybe', comment: null, autoRegisterWhenPromoted: false, termsAcceptedAt: agreedAt },
      { dateOptionId: 'd2', status: 'maybe', comment: null, autoRegisterWhenPromoted: false, termsAcceptedAt: agreedAt },
    ])

    expect((await post()).status).toBe(201)
    expect(writtenConsent()).toEqual([agreedAt, agreedAt])
  })

  it('同意を記録する前の回答は引き継がない。回答し直すには同意が要る', async () => {
    prismaMock.preEventParticipant.findMany.mockResolvedValueOnce([
      { dateOptionId: 'd1', status: 'maybe', comment: null, autoRegisterWhenPromoted: true, termsAcceptedAt: null },
    ])

    expect((await post()).status).toBe(400)
  })

  it('規約が無ければ同意は要らず、記録もしない', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue({ ...PRE_EVENT, terms: null })

    expect((await post({ termsAccepted: true })).status).toBe(201)
    expect(writtenConsent()).toEqual([null, null])
  })
})
