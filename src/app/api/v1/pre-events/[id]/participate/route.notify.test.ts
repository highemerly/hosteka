import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))

/*
  送出のスケジュール（`after()`）はリクエストスコープの外では使えないので、
  その場で走らせる形に差し替える。どれが呼ばれたかを見たいので、
  出来事ごとの関数はモックにする。
*/
const notifyPreEventAnswered = vi.fn()
vi.mock('@/server/notifications/notify', () => ({
  notifyAfter: (_label: string, run: () => Promise<unknown>) => void run(),
  notifyPreEventAnswered: (...args: unknown[]) => notifyPreEventAnswered(...args),
}))

import { getSession } from '@/server/auth/session'
import { POST } from './route'

/**
 * 日程調整の回答は毎回「総入れ替え」で保存される。
 * **開いて同じ内容で保存し直しただけで主催者に通知が飛んではならない。**
 */
const PRE_EVENT = {
  id: 'pre_1',
  title: '歓迎会の日程',
  isDisabled: false,
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedFediverseServers: null,
  allowAutoRegistration: false,
  dateOptions: [{ id: 'd1' }, { id: 'd2' }],
}

function answer(status: string, comment: string | null = 'よろしく') {
  return [
    { dateOptionId: 'd1', status: 'available', comment, autoRegisterWhenPromoted: false },
    { dateOptionId: 'd2', status, comment, autoRegisterWhenPromoted: false },
  ]
}

function post(status = 'unavailable', comment: string | null = 'よろしく') {
  return POST(
    makeRequest('/api/v1/pre-events/pre_1/participate', {
      method: 'POST',
      body: {
        responses: [
          { dateOptionId: 'd1', status: 'available' },
          { dateOptionId: 'd2', status },
        ],
        comment,
      },
    }),
    { params: Promise.resolve({ id: 'pre_1' }) }
  )
}

beforeEach(() => {
  resetPrismaMock()
  notifyPreEventAnswered.mockReset()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.user)
  prismaMock.preEvent.findUnique.mockResolvedValue(PRE_EVENT)
  prismaMock.preEventParticipant.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.preEventParticipant.createMany.mockResolvedValue({ count: 2 })
})

describe('日程調整の回答の通知', () => {
  it('はじめて答えたら主催者に知らせる', async () => {
    prismaMock.preEventParticipant.findMany
      .mockResolvedValueOnce([]) // 消す前の回答（まだ無い）
      .mockResolvedValueOnce(answer('unavailable'))

    expect((await post()).status).toBe(201)
    expect(notifyPreEventAnswered).toHaveBeenCalledWith(
      { id: 'pre_1', title: '歓迎会の日程' },
      'user_1'
    )
  })

  it('答えを変えたら知らせる', async () => {
    prismaMock.preEventParticipant.findMany
      .mockResolvedValueOnce(answer('available'))
      .mockResolvedValueOnce(answer('unavailable'))

    await post()
    expect(notifyPreEventAnswered).toHaveBeenCalled()
  })

  /** 編集画面を開いて、そのまま保存しただけ */
  it('同じ内容で保存し直しただけなら知らせない', async () => {
    prismaMock.preEventParticipant.findMany
      .mockResolvedValueOnce(answer('unavailable'))
      .mockResolvedValueOnce(answer('unavailable'))

    expect((await post()).status).toBe(201)
    expect(notifyPreEventAnswered).not.toHaveBeenCalled()
  })

  /** 行の順は総入れ替えのたびに変わる。それだけで通知が飛んではならない */
  it('保存された行の順が変わっただけなら知らせない', async () => {
    const before = answer('unavailable')
    prismaMock.preEventParticipant.findMany
      .mockResolvedValueOnce([before[1], before[0]])
      .mockResolvedValueOnce(before)

    await post()
    expect(notifyPreEventAnswered).not.toHaveBeenCalled()
  })

  it('コメントだけ変えても知らせる', async () => {
    prismaMock.preEventParticipant.findMany
      .mockResolvedValueOnce(answer('unavailable', 'よろしく'))
      .mockResolvedValueOnce(answer('unavailable', '遅れます'))

    await post('unavailable', '遅れます')
    expect(notifyPreEventAnswered).toHaveBeenCalled()
  })
})
