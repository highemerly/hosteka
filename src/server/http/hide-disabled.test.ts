import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))
// 404 の経路では使われないが、route.ts の import で読み込まれる
vi.mock('@/server/services/auto-cancel-maybe', () => ({ autoCancelMaybeForEvent: vi.fn() }))

import { getSession, isAdminUser } from '@/server/auth/session'
import { hideDisabledFromNonAdmins } from './guards'
import { GET as getEvent } from '@/app/api/v1/events/[id]/route'
import { POST as participateEvent } from '@/app/api/v1/events/[id]/participate/route'
import { POST as cancelEvent } from '@/app/api/v1/events/[id]/cancel/route'
import { POST as postToParticipants } from '@/app/api/v1/events/post-immediate/route'
import { GET as getPreEvent } from '@/app/api/v1/pre-events/[id]/route'
import {
  GET as getMyAnswers,
  POST as answerPreEvent,
} from '@/app/api/v1/pre-events/[id]/participate/route'

const mockGetSession = vi.mocked(getSession)
const mockIsAdmin = vi.mocked(isAdminUser)

const ID = 'clxxxxxxxxxxxxxxxxxxxxxx1'
const args = { params: Promise.resolve({ id: ID }) }

/**
 * 管理者が無効化したものは、管理者以外には「無い」。
 *
 * 一覧から外すだけでは、URL を知っている人は詳細を開ける
 * （参加登録の画面まで出る）。
 */
beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockIsAdmin.mockReset()
})

describe('hideDisabledFromNonAdmins', () => {
  it('無効化されていなければ DB に触れない', async () => {
    await hideDisabledFromNonAdmins(false, PERSONAS.user, 'x')
    expect(mockIsAdmin).not.toHaveBeenCalled()
  })

  it('無効化されていれば、未ログインにも一般ユーザーにも 404', async () => {
    mockIsAdmin.mockResolvedValue(false)
    await expect(hideDisabledFromNonAdmins(true, null, '無い')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(hideDisabledFromNonAdmins(true, PERSONAS.user, '無い')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('管理者には見せる。判定はトークンではなく DB で行う', async () => {
    mockIsAdmin.mockResolvedValue(true)
    await expect(hideDisabledFromNonAdmins(true, PERSONAS.admin, '無い')).resolves.toBeUndefined()
    expect(mockIsAdmin).toHaveBeenCalledWith('admin_1')
  })
})

describe('詳細 API は無効化されたものを管理者以外に返さない', () => {
  it('イベント', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    mockIsAdmin.mockResolvedValue(false)
    prismaMock.event.findUnique.mockResolvedValue({ id: ID, isDisabled: true })

    const res = await getEvent(makeRequest(`/api/v1/events/${ID}`), args)
    expect(res.status).toBe(404)
    // 判定に要る列を select から落としていないこと（omit で消していた）
    expect(prismaMock.event.findUnique.mock.calls[0][0].omit).toBeUndefined()
  })

  it('日程調整', async () => {
    mockGetSession.mockResolvedValue(null)
    prismaMock.preEvent.findUnique.mockResolvedValue({ id: ID, isDisabled: true })

    const res = await getPreEvent(makeRequest(`/api/v1/pre-events/${ID}`), args)
    expect(res.status).toBe(404)
    expect(prismaMock.preEvent.findUnique.mock.calls[0][0].select.isDisabled).toBe(true)
  })
})

/**
 * 詳細を塞いだだけでは足りない。**画面から辿れなくても API は叩ける**ので、
 * 書き込みの入口でも同じ判定をする（`disabled.guard.test.ts` が全ルートを走査する）。
 */
describe('無効化されたものには、参加・回答・連絡・主催者の操作も通さない', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    mockIsAdmin.mockResolvedValue(false)
  })

  it('イベントへの参加登録', async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: ID,
      isDisabled: true,
      status: 'active',
      participants: [],
    })
    const res = await participateEvent(
      makeRequest(`/api/v1/events/${ID}/participate`, { method: 'POST', body: { status: 'attending' } }),
      args
    )
    expect(res.status).toBe(404)
    expect(prismaMock.eventParticipant.create).not.toHaveBeenCalled()
  })

  it('参加者への連絡（SNS への投稿）。止めたイベントから投稿が出ない', async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: ID,
      isDisabled: true,
      creatorId: 'user_1',
      participants: [],
    })
    const res = await postToParticipants(
      makeRequest('/api/v1/events/post-immediate', {
        method: 'POST',
        body: { eventId: ID, message: 'hi', participantIds: ['u2'] },
      })
    )
    expect(res.status).toBe(404)
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('主催者の操作（中止など）は、主催者本人でも 404', async () => {
    // 主催者本人。判定が無ければ権限の確認を通ってしまう形にしておく
    prismaMock.event.findUnique.mockResolvedValue({
      id: ID,
      isDisabled: true,
      creatorId: 'user_1',
      organizationId: null,
      participants: [],
    })
    const res = await cancelEvent(
      makeRequest(`/api/v1/events/${ID}/cancel`, { method: 'POST', body: {} }),
      args
    )
    expect(res.status).toBe(404)
  })

  it('日程調整への回答と、自分の回答の取得', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue({ id: ID, isDisabled: true, dateOptions: [] })

    /*
      **本文は正しい形で送る。** 入力の検証はガードより先に走るので、
      空の回答を送ると「無効化されているから404」ではなく「本文が不正だから400」に
      なってしまい、確かめたい判定に届かない。
    */
    const post = await answerPreEvent(
      makeRequest(`/api/v1/pre-events/${ID}/participate`, {
        method: 'POST',
        body: { responses: [{ dateOptionId: 'opt_1', status: 'available' }] },
      }),
      args
    )
    expect(post.status).toBe(404)

    const get = await getMyAnswers(makeRequest(`/api/v1/pre-events/${ID}/participate`), args)
    expect(get.status).toBe(404)
    expect(prismaMock.preEventParticipant.findMany).not.toHaveBeenCalled()
  })

  it('管理者は通る（無効化したものを見直すため）', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.admin)
    mockIsAdmin.mockResolvedValue(true)
    prismaMock.preEvent.findUnique.mockResolvedValue({ id: ID, isDisabled: true })
    prismaMock.preEventParticipant.findMany.mockResolvedValue([])

    const res = await getMyAnswers(makeRequest(`/api/v1/pre-events/${ID}/participate`), args)
    expect(res.status).toBe(200)
  })
})
