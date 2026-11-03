import { afterEach, describe, it, vi, beforeEach, expect } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))
/*
  `after()` はリクエストスコープの外で投げるので、handler を直接呼ぶテストからは
  通せない。差し替えないと、成功するはずの経路がすべて 500 になる。
*/
vi.mock('@/server/notifications/notify', () => ({
  notifyAfter: vi.fn(),
  notifyParticipationChanged: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { POST, PUT } from './route'

const mockGetSession = vi.mocked(getSession)

const EVENT = {
  id: 'evt_1',
  status: 'active',
  terms: '参加規約の本文',
  maxParticipants: null as number | null,
  allowMaybe: true,
  allowParticipationRequest: true,
  registrationDeadlineDate: null as Date | null,
  registrationDeadlineTime: null as string | null,
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedFediverseServers: null as string | null,
  optionGroups: [],
}

/** トランザクションの中身まで走らせる。満員の判定は中にある */
function runTransactions() {
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(prismaMock)
  )
  prismaMock.eventParticipant.create.mockResolvedValue({ id: 'p_1' })
  prismaMock.eventParticipant.update.mockResolvedValue({ id: 'p_1' })
  // 変更の前に控える「いま選んでいる選択肢」
  prismaMock.participantGroupOption.findMany.mockResolvedValue([])
}

const ctx = { params: Promise.resolve({ id: 'evt_1' }) }

function body(input: Record<string, unknown>) {
  return { method: 'POST', body: input }
}

async function readError(response: Response) {
  return (await response.json()) as { error?: { message: string } }
}

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(PERSONAS.user)
  prismaMock.event.findUnique.mockResolvedValue(EVENT)
  prismaMock.eventParticipant.findUnique.mockResolvedValue(null)
  prismaMock.$transaction.mockImplementation(async () => ({ id: 'p_1' }))
  prismaMock.eventParticipant.findUnique.mockResolvedValue(null)
})

describe('POST /api/v1/events/[id]/participate', () => {
  it('規約があるのに同意なしで参加登録すると弾く', async () => {
    const res = await POST(
      makeRequest('/api/v1/events/evt_1/participate', body({ status: 'attending' })),
      ctx
    )
    expect(res.status).toBe(400)
    expect((await readError(res)).error?.message).toContain('参加規約')
  })

  it('欠席には規約同意を求めない。参加しない人に同意を求めるのは筋が通らない', async () => {
    prismaMock.eventParticipant.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'p_1', user: {}, event: {} })

    const res = await POST(
      makeRequest('/api/v1/events/evt_1/participate', body({ status: 'not_attending' })),
      ctx
    )
    expect(res.status).not.toBe(400)
  })

  it('記録が既にあれば作成させない。変更は PUT の仕事', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue({
      id: 'p_1',
      status: 'cancelled',
    })

    const res = await POST(
      makeRequest(
        '/api/v1/events/evt_1/participate',
        body({ status: 'attending', termsAccepted: true })
      ),
      ctx
    )
    expect(res.status).toBe(400)
    expect((await readError(res)).error?.message).toContain('既に参加登録されています')
  })
})

/*
  **満員かどうかは、席を取る直前にロックの中で数える。** 以前はトランザクションの
  外で数えていて、最後の1席に同時に来た2人が両方通り、定員を超えた。
*/
describe('定員', () => {
  const attend = () =>
    POST(
      makeRequest(
        '/api/v1/events/evt_1/participate',
        body({ status: 'attending', termsAccepted: true })
      ),
      ctx
    )

  beforeEach(() => {
    runTransactions()
    prismaMock.event.findUnique.mockResolvedValue({ ...EVENT, maxParticipants: 2 })
  })

  it('満員なら作成しない', async () => {
    prismaMock.eventParticipant.count.mockResolvedValue(2)

    const res = await attend()
    expect(res.status).toBe(400)
    expect((await readError(res)).error?.message).toContain('満員')
    expect(prismaMock.eventParticipant.create).not.toHaveBeenCalled()
  })

  it('数える前にイベントの行をロックする', async () => {
    prismaMock.eventParticipant.count.mockResolvedValue(1)
    prismaMock.eventParticipant.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'p_1', user: {}, event: {} })

    const res = await attend()
    expect(res.status).toBe(201)

    const locked = prismaMock.$queryRaw.mock.invocationCallOrder[0]
    const counted = prismaMock.eventParticipant.count.mock.invocationCallOrder[0]
    const written = prismaMock.eventParticipant.create.mock.invocationCallOrder[0]
    expect(locked).toBeLessThan(counted)
    expect(counted).toBeLessThan(written)
  })

  it('未定は席を取らないので、満員でも受け付ける', async () => {
    prismaMock.eventParticipant.count.mockResolvedValue(2)
    prismaMock.eventParticipant.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'p_1', user: {}, event: {} })

    const res = await POST(
      makeRequest(
        '/api/v1/events/evt_1/participate',
        body({ status: 'maybe', termsAccepted: true })
      ),
      ctx
    )
    expect(res.status).toBe(201)
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled()
  })

  it('変更で参加へ移るときも同じ判定を通る。本人の行は数えない', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue({
      id: 'p_1',
      status: 'maybe',
      termsAccepted: true,
    })
    prismaMock.eventParticipant.count.mockResolvedValue(2)

    const res = await PUT(
      makeRequest('/api/v1/events/evt_1/participate', {
        method: 'PUT',
        body: { status: 'attending' },
      }),
      ctx
    )
    expect(res.status).toBe(400)
    expect((await readError(res)).error?.message).toContain('満員')
    expect(prismaMock.eventParticipant.count).toHaveBeenCalledWith({
      where: { eventId: 'evt_1', status: 'attending', userId: { not: PERSONAS.user.user.id } },
    })
    expect(prismaMock.eventParticipant.update).not.toHaveBeenCalled()
  })
})

/*
  締切は画面に出ているのと同じ瞬間で切る（`lib/event-datetime.ts`）。
  日付列には旧形式（JST 0時 = 前日の 15:00Z）の行が残っていて、UTC の日付で
  読むと1日早く締め切っていた。
*/
describe('締切', () => {
  // 3月1日 18:00 JST が締切。旧形式で保存された行
  const LEGACY = {
    ...EVENT,
    terms: null,
    registrationDeadlineDate: new Date('2026-02-28T15:00:00Z'),
    registrationDeadlineTime: '18:00',
  }
  const attend = () =>
    POST(makeRequest('/api/v1/events/evt_1/participate', body({ status: 'attending' })), ctx)

  beforeEach(() => {
    vi.useFakeTimers()
    prismaMock.event.findUnique.mockResolvedValue(LEGACY)
    prismaMock.eventParticipant.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'p_1', user: {}, event: {} })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('締切の当日、時刻より前なら受け付ける', async () => {
    vi.setSystemTime(new Date('2026-03-01T17:59:00+09:00'))
    expect((await attend()).status).toBe(201)
  })

  it('締切の時刻を過ぎたら断る', async () => {
    vi.setSystemTime(new Date('2026-03-01T18:01:00+09:00'))
    const res = await attend()
    expect(res.status).toBe(400)
    expect((await readError(res)).error?.message).toContain('期限')
  })

  it('参加リクエストは締切の対象外', async () => {
    vi.setSystemTime(new Date('2026-03-01T18:01:00+09:00'))
    const res = await POST(
      makeRequest('/api/v1/events/evt_1/participate', body({ status: 'participation_request' })),
      ctx
    )
    expect(res.status).toBe(201)
  })
})

describe('PUT /api/v1/events/[id]/participate', () => {
  const putRequest = (input: Record<string, unknown>) =>
    makeRequest('/api/v1/events/evt_1/participate', { method: 'PUT', body: input })

  /*
    作成（POST）にあるサーバー限定の判定が、変更（PUT）には無かった。
    キャンセルしたあとに主催者がサーバーを絞っても、PUT で参加へ戻せた。
  */
  describe('参加できるサーバーを絞ったあと', () => {
    beforeEach(() => {
      runTransactions()
      prismaMock.event.findUnique.mockResolvedValue({
        ...EVENT,
        allowedFediverseServers: JSON.stringify(['other.example']),
      })
    })

    it('対象外のサーバーの人は、キャンセルから参加へ戻せない', async () => {
      prismaMock.eventParticipant.findUnique.mockResolvedValue({
        id: 'p_1',
        status: 'cancelled',
        termsAccepted: true,
      })

      const res = await PUT(putRequest({ status: 'attending' }), ctx)
      expect(res.status).toBe(403)
      expect((await readError(res)).error?.message).toContain('あなたのサーバー')
      expect(prismaMock.eventParticipant.update).not.toHaveBeenCalled()
    })

    it('参加中の人が降りることは止めない', async () => {
      prismaMock.eventParticipant.findUnique
        .mockResolvedValueOnce({ id: 'p_1', status: 'attending', termsAccepted: true })
        .mockResolvedValue({ id: 'p_1', user: {}, event: {} })

      const res = await PUT(putRequest({ status: 'cancelled' }), ctx)
      expect(res.status).toBe(200)
    })
  })

  it('キャンセル済みから参加へ戻せる。規約は取り直す', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue({
      id: 'p_1',
      status: 'cancelled',
      termsAccepted: false,
    })

    const res = await PUT(putRequest({ status: 'attending' }), ctx)
    expect(res.status).toBe(400)
    expect((await readError(res)).error?.message).toContain('参加規約')
  })

  it('参加中から欠席へは変えられない。取り消すならキャンセル', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue({
      id: 'p_1',
      status: 'attending',
      termsAccepted: true,
    })

    const res = await PUT(putRequest({ status: 'not_attending' }), ctx)
    expect(res.status).toBe(400)
    expect((await readError(res)).error?.message).toContain('キャンセル')
  })

  it('参加中からキャンセルへは変えられる', async () => {
    prismaMock.eventParticipant.findUnique
      .mockResolvedValueOnce({ id: 'p_1', status: 'attending', termsAccepted: true })
      .mockResolvedValue({ id: 'p_1', user: {}, event: {} })

    const res = await PUT(putRequest({ status: 'cancelled' }), ctx)
    expect(res.status).not.toBe(400)
  })

  it('参加中から未定へも変えられない。下げるならキャンセル', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue({
      id: 'p_1',
      status: 'attending',
      termsAccepted: true,
    })

    const res = await PUT(putRequest({ status: 'maybe' }), ctx)
    expect(res.status).toBe(400)
    expect((await readError(res)).error?.message).toContain('キャンセル')
  })

  it('未定から参加へは変えられる', async () => {
    prismaMock.eventParticipant.findUnique
      .mockResolvedValueOnce({ id: 'p_1', status: 'maybe', termsAccepted: true })
      .mockResolvedValue({ id: 'p_1', user: {}, event: {} })

    const res = await PUT(putRequest({ status: 'attending' }), ctx)
    expect(res.status).not.toBe(400)
  })

  it('参加登録していなければ 404', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue(null)
    const res = await PUT(putRequest({ status: 'attending' }), ctx)
    expect(res.status).toBe(404)
  })
})

/*
  **画面が出さない選択肢を、API を直接叩いて選べないこと。**
  画面は「未定」を受け付けないイベントに未定を並べず、満席の選択肢を
  押せなくしているだけなので、サーバーでも同じ規則を守る。
*/
describe('「未定」を受け付けないイベント', () => {
  beforeEach(() => {
    runTransactions()
    prismaMock.event.findUnique.mockResolvedValue({ ...EVENT, allowMaybe: false })
  })

  it('未定では登録できない', async () => {
    const res = await POST(
      makeRequest('/api/v1/events/evt_1/participate', body({ status: 'maybe', termsAccepted: true })),
      ctx
    )
    expect(res.status).toBe(400)
    expect((await readError(res)).error?.message).toContain('未定')
    expect(prismaMock.eventParticipant.create).not.toHaveBeenCalled()
  })

  it('キャンセルから未定へは戻せない', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue({
      id: 'p_1',
      status: 'cancelled',
      termsAccepted: true,
    })

    const res = await PUT(
      makeRequest('/api/v1/events/evt_1/participate', { method: 'PUT', body: { status: 'maybe' } }),
      ctx
    )
    expect(res.status).toBe(400)
  })

  /** あとから主催者が設定を変えても、すでに未定の人は内容を直せる（画面も今の状態を並べる） */
  it('すでに未定の人は、未定のまま内容を直せる', async () => {
    prismaMock.eventParticipant.findUnique
      .mockResolvedValueOnce({ id: 'p_1', status: 'maybe', termsAccepted: true })
      .mockResolvedValue({ id: 'p_1', user: {}, event: {} })

    const res = await PUT(
      makeRequest('/api/v1/events/evt_1/participate', {
        method: 'PUT',
        body: { status: 'maybe', comment: '直した' },
      }),
      ctx
    )
    expect(res.status).toBe(200)
  })
})

describe('選択肢の定員', () => {
  const GROUP = {
    id: 'g_1',
    responseType: 'single',
    options: [
      { id: 'o_full', name: '懇親会あり', maxParticipants: 2 },
      { id: 'o_free', name: '懇親会なし', maxParticipants: null },
    ],
  }

  const answer = (optionId: string) => ({
    status: 'attending',
    termsAccepted: true,
    selectedGroupOptions: { g_1: [optionId] },
  })

  beforeEach(() => {
    runTransactions()
    prismaMock.event.findUnique.mockResolvedValue({ ...EVENT, optionGroups: [GROUP] })
    prismaMock.participantGroupSelection.create.mockResolvedValue({ id: 'sel_1' })
    // 他の人の選択で、定員2のうち2つが埋まっている
    prismaMock.participantGroupOption.count.mockResolvedValue(2)
  })

  it('満席の選択肢は選べない', async () => {
    const res = await POST(makeRequest('/api/v1/events/evt_1/participate', body(answer('o_full'))), ctx)

    expect(res.status).toBe(400)
    expect((await readError(res)).error?.message).toContain('懇親会あり')
    expect(prismaMock.participantGroupOption.createMany).not.toHaveBeenCalled()
  })

  it('数える前にイベントの行をロックする', async () => {
    await POST(makeRequest('/api/v1/events/evt_1/participate', body(answer('o_full'))), ctx)

    const locked = prismaMock.$queryRaw.mock.invocationCallOrder[0]
    const counted = prismaMock.participantGroupOption.count.mock.invocationCallOrder[0]
    expect(locked).toBeLessThan(counted)
  })

  it('定員の無い選択肢は数えない', async () => {
    prismaMock.eventParticipant.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'p_1', user: {}, event: {} })

    const res = await POST(makeRequest('/api/v1/events/evt_1/participate', body(answer('o_free'))), ctx)

    expect(res.status).toBe(201)
    expect(prismaMock.participantGroupOption.count).not.toHaveBeenCalled()
  })

  /** あとから定員を減らされても、選んでいた人を外さない（画面も解除だけはできる） */
  it('すでに選んでいた選択肢は、満席でもそのまま直せる', async () => {
    prismaMock.eventParticipant.findUnique
      .mockResolvedValueOnce({ id: 'p_1', status: 'attending', termsAccepted: true })
      .mockResolvedValue({ id: 'p_1', user: {}, event: {} })
    prismaMock.participantGroupOption.findMany.mockResolvedValue([{ optionId: 'o_full' }])

    const res = await PUT(
      makeRequest('/api/v1/events/evt_1/participate', { method: 'PUT', body: answer('o_full') }),
      ctx
    )

    expect(res.status).toBe(200)
  })
})
