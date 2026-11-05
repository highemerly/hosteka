import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PERSONAS, expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))
vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), isAdminUser: vi.fn() }))
vi.mock('@/lib/permissions', () => ({ checkOrganizerPermission: vi.fn() }))

/*
  送出のスケジュール（`after()`）はリクエストスコープの外では使えないので、
  その場で走らせる形に差し替える。どれが呼ばれたかを見たいので、
  出来事ごとの関数はモックにする。
*/
const notifyParticipationDecided = vi.fn()
const notifyParticipationRemoved = vi.fn()
const notifyOrganizerChanged = vi.fn()
vi.mock('@/server/notifications/notify', () => ({
  notifyAfter: (_label: string, run: () => Promise<unknown>) => void run(),
  notifyParticipationDecided: (...a: unknown[]) => notifyParticipationDecided(...a),
  notifyParticipationRemoved: (...a: unknown[]) => notifyParticipationRemoved(...a),
  notifyOrganizerChanged: (...a: unknown[]) => notifyOrganizerChanged(...a),
}))


import { getSession } from '@/server/auth/session'
import { checkOrganizerPermission } from '@/lib/permissions'
import { DELETE, PATCH } from './route'

const mockGetSession = vi.mocked(getSession)
const mockIsOrganizer = vi.mocked(checkOrganizerPermission)

const params = Promise.resolve({ id: 'evt_1', userId: 'user_2' })

/** guard（存在確認）と handler の両方がこれを引く。見ている人（user_1）が作成者 */
const EVENT = {
  id: 'evt_1',
  // 通知の写しに使う
  title: '花見の会',
  status: 'published',
  creatorId: 'user_1',
  maxParticipants: 10,
}

const participant = (status: string, isOrganizer = false) => ({
  id: 'p_row',
  status,
  isOrganizer,
})

const patch = (action: string) => makeRequest('/x', { method: 'PATCH', body: { action } })
const del = () => makeRequest('/x', { method: 'DELETE' })

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockIsOrganizer.mockReset()
  mockIsOrganizer.mockResolvedValue(true)
  mockGetSession.mockResolvedValue(PERSONAS.user)
  prismaMock.event.findUnique.mockResolvedValue(EVENT)
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(prismaMock)
  )
  prismaMock.eventParticipant.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.eventParticipant.deleteMany.mockResolvedValue({ count: 1 })
})

describe('PATCH /api/v1/events/[id]/participants/[userId]', () => {
  it('未ログインは401', async () => {
    mockGetSession.mockResolvedValue(null)
    await expectContract(await PATCH(patch('cancel'), { params }))
  })

  it('主催者・幹事でなければ403', async () => {
    mockIsOrganizer.mockResolvedValue(false)
    const response = await PATCH(patch('cancel'), { params })
    expect(response.status).toBe(403)
    await expectContract(response)
  })

  it('参加者がいなければ404', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue(null)
    const response = await PATCH(patch('cancel'), { params })
    expect(response.status).toBe(404)
    await expectContract(response)
  })

  it('参加リクエストを承認すると参加になる', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue(participant('participation_request'))
    prismaMock.eventParticipant.count.mockResolvedValue(3)

    const response = await PATCH(patch('approve'), { params })
    expect(response.status).toBe(200)
    await expectContract(response)
    expect(prismaMock.eventParticipant.updateMany).toHaveBeenCalledWith({
      where: { id: 'p_row', status: 'participation_request' },
      data: { status: 'attending', cancellationReason: null },
    })
    expect(prismaMock.event.update).not.toHaveBeenCalled()
  })

  it('定員を超えて承認したら定員を増やす', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue(participant('participation_request'))
    prismaMock.eventParticipant.count.mockResolvedValue(10)

    await PATCH(patch('approve'), { params })
    expect(prismaMock.event.update).toHaveBeenCalledWith({
      where: { id: 'evt_1' },
      data: { maxParticipants: 11 },
    })
  })

  /*
    **幹事と作成者はキャンセルにできない**（`allowedAdminActions`）。キャンセルにすると幹事も
    外れるので、作成者でない幹事がほかの幹事を外せてしまう。作成者は先に幹事を解除する。
  */
  it('幹事はキャンセルにできない（作成者が見ていても400）', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue(participant('attending', true))

    const response = await PATCH(patch('cancel'), { params })
    expect(response.status).toBe(400)
    expect(prismaMock.eventParticipant.updateMany).not.toHaveBeenCalled()
  })

  it('作成者でない幹事は、作成者をキャンセルにできない（400）', async () => {
    // 対象（user_2）が作成者で、見ている人は幹事
    prismaMock.event.findUnique.mockResolvedValue({ ...EVENT, creatorId: 'user_2' })
    prismaMock.eventParticipant.findUnique.mockResolvedValue(participant('attending'))

    const response = await PATCH(patch('cancel'), { params })
    expect(response.status).toBe(400)
    expect(prismaMock.eventParticipant.updateMany).not.toHaveBeenCalled()
  })

  it('幹事でない参加者はキャンセルにできる', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue(participant('attending'))

    const response = await PATCH(patch('cancel'), { params })
    expect(response.status).toBe(200)
    expect(prismaMock.eventParticipant.updateMany).toHaveBeenCalledWith({
      where: { id: 'p_row', status: 'attending' },
      data: { status: 'cancelled', cancellationReason: 'admin_cancelled', isOrganizer: false },
    })
  })

  it('キャンセルの人は参加に戻せない（400）', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue(participant('cancelled'))

    const response = await PATCH(patch('approve'), { params })
    expect(response.status).toBe(400)
    await expectContract(response)
    expect(prismaMock.eventParticipant.updateMany).not.toHaveBeenCalled()
  })

  it('幹事の指定は作成者だけ（403）', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ ...EVENT, creatorId: 'someone_else' })
    prismaMock.eventParticipant.findUnique.mockResolvedValue(participant('attending'))

    const response = await PATCH(patch('assign_organizer'), { params })
    expect(response.status).toBe(403)
    await expectContract(response)
  })

  it('読んでから状態が変わっていたら409', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue(participant('maybe'))
    prismaMock.eventParticipant.updateMany.mockResolvedValue({ count: 0 })

    const response = await PATCH(patch('cancel'), { params })
    expect(response.status).toBe(409)
    await expectContract(response)
  })

  it('中止されたイベントは403', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ ...EVENT, status: 'cancelled' })
    const response = await PATCH(patch('cancel'), { params })
    expect(response.status).toBe(403)
  })
})

describe('DELETE /api/v1/events/[id]/participants/[userId]', () => {
  it.each(['cancelled', 'not_attending'])('%s の記録は出欠ごと消せる', async (status) => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue(participant(status))

    const response = await DELETE(del(), { params })
    expect(response.status).toBe(200)
    expect(prismaMock.eventParticipant.deleteMany).toHaveBeenCalledWith({
      where: { id: 'p_row', status },
    })
    expect(prismaMock.eventAttendance.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'evt_1', userId: 'user_2' },
    })
  })

  it('参加中の人は消せない（400）', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue(participant('attending'))

    const response = await DELETE(del(), { params })
    expect(response.status).toBe(400)
    await expectContract(response)
    expect(prismaMock.eventParticipant.deleteMany).not.toHaveBeenCalled()
  })
})

describe('参加者の操作で届く通知', () => {
  const EVENT_REF = { id: 'evt_1', title: '花見の会' }
  const VIEWER = PERSONAS.user.user.id

  beforeEach(() => {
    notifyParticipationDecided.mockReset()
    notifyParticipationRemoved.mockReset()
    notifyOrganizerChanged.mockReset()
  })

  it('承認すると本人に届く', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue(participant('participation_request'))
    prismaMock.eventParticipant.count.mockResolvedValue(0)

    await PATCH(patch('approve'), { params })

    expect(notifyParticipationDecided).toHaveBeenCalledWith(EVENT_REF, 'user_2', true, VIEWER)
  })

  /**
   * **見送りと取り消しを言い分ける。** リクエストを断られたのと、
   * 参加していたのを主催者に外されたのとでは、本人にとって意味が違う
   */
  it('見送りは「見送られた」として届く', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue(participant('participation_request'))

    await PATCH(patch('reject'), { params })

    expect(notifyParticipationDecided).toHaveBeenCalledWith(EVENT_REF, 'user_2', false, VIEWER)
    expect(notifyParticipationRemoved).not.toHaveBeenCalled()
  })

  it('主催者によるキャンセルは別の通知になる', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue(participant('attending'))

    await PATCH(patch('cancel'), { params })

    expect(notifyParticipationRemoved).toHaveBeenCalledWith(EVENT_REF, 'user_2', VIEWER)
    expect(notifyParticipationDecided).not.toHaveBeenCalled()
  })

  it('幹事の指定が本人に届く', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue(participant('attending'))

    await PATCH(patch('assign_organizer'), { params })

    expect(notifyOrganizerChanged).toHaveBeenCalledWith(EVENT_REF, 'user_2', true, VIEWER)
  })

  it('幹事の解除も本人に届く', async () => {
    prismaMock.eventParticipant.findUnique.mockResolvedValue(participant('attending', true))

    await PATCH(patch('unassign_organizer'), { params })

    expect(notifyOrganizerChanged).toHaveBeenCalledWith(EVENT_REF, 'user_2', false, VIEWER)
  })
})
