import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
import { DELETE, POST } from './route'

/**
 * 回答の締切。
 *
 * **画面は締切後に操作を出さないが、サーバーは見ていなかった。** API を直に
 * 叩けば締切後も回答を足したり消したりでき、主催者が日程を決めたあとで
 * 集計が動いた。
 */
const PRE_EVENT = {
  id: 'pre_1',
  title: '歓迎会の日程',
  isDisabled: false,
  // 9月10日 18:00 JST
  registrationDeadline: new Date('2026-09-10T18:00:00+09:00') as Date | null,
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedFediverseServers: null,
  allowAutoRegistration: false,
  dateOptions: [{ id: 'd1' }],
}

const ctx = { params: Promise.resolve({ id: 'pre_1' }) }

function post() {
  return POST(
    makeRequest('/api/v1/pre-events/pre_1/participate', {
      method: 'POST',
      body: { responses: [{ dateOptionId: 'd1', status: 'available' }] },
    }),
    ctx
  )
}

function del() {
  return DELETE(makeRequest('/api/v1/pre-events/pre_1/participate', { method: 'DELETE' }), ctx)
}

async function message(response: Response) {
  return ((await response.json()) as { error?: { message: string } }).error?.message
}

beforeEach(() => {
  vi.useFakeTimers()
  resetPrismaMock()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.user)
  prismaMock.preEvent.findUnique.mockResolvedValue(PRE_EVENT)
  prismaMock.preEventParticipant.findMany.mockResolvedValue([])
  prismaMock.preEventParticipant.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.preEventParticipant.createMany.mockResolvedValue({ count: 1 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('日程調整の回答の締切', () => {
  it('締切より前なら回答できる', async () => {
    vi.setSystemTime(new Date('2026-09-10T17:59:00+09:00'))
    expect((await post()).status).toBe(201)
  })

  it('締切を過ぎたら回答できない。既存の回答にも触らない', async () => {
    vi.setSystemTime(new Date('2026-09-10T18:01:00+09:00'))

    const res = await post()
    expect(res.status).toBe(400)
    expect(await message(res)).toContain('受付は終了')
    expect(prismaMock.preEventParticipant.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.preEventParticipant.createMany).not.toHaveBeenCalled()
  })

  it('締切を過ぎたら回答を消すこともできない', async () => {
    vi.setSystemTime(new Date('2026-09-10T18:01:00+09:00'))

    const res = await del()
    expect(res.status).toBe(400)
    expect(prismaMock.preEventParticipant.deleteMany).not.toHaveBeenCalled()
  })

  it('締切より前なら回答を消せる', async () => {
    vi.setSystemTime(new Date('2026-09-10T17:59:00+09:00'))
    expect((await del()).status).toBe(200)
    expect(prismaMock.preEventParticipant.deleteMany).toHaveBeenCalled()
  })

  it('締切が無ければいつでも回答できる', async () => {
    vi.setSystemTime(new Date('2030-01-01T00:00:00+09:00'))
    prismaMock.preEvent.findUnique.mockResolvedValue({ ...PRE_EVENT, registrationDeadline: null })
    expect((await post()).status).toBe(201)
  })
})
