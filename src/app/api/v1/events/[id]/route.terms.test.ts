import { describe, it, vi, beforeEach, expect } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))

/*
  通知の送出はスケジュールだけ止める。`after()` はリクエストスコープの外で
  投げるので、handler を直接呼ぶテストではここを通せない。
*/
vi.mock('@/server/notifications/notify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/notifications/notify')>()),
  notifyAfter: vi.fn(),
}))


import { getSession } from '@/server/auth/session'
import { PUT } from './route'

/**
 * 参加規約を変えられる条件（`canEditEventTerms`）を、PUT が本当に守るか。
 *
 * **画面が欄を読み取り専用にしているだけでは足りない。** API を直接叩けば
 * 通ってしまうし、「同意していない内容に同意したことになっている人」は
 * 後から検出できない。
 */

const TERMS = '### キャンセル\n- 前日以降は50%'

/** 3回引かれる event.findUnique（guard / 権限 / 本体）を1つで賄う */
function event(participants: { status: string }[], terms: string | null = TERMS) {
  return {
    id: 'evt_1',
    isDisabled: false,
    creatorId: PERSONAS.user.user.id,
    organizationId: null,
    status: 'published',
    startDate: new Date('2026-09-12T00:00:00+09:00'),
    terms,
    isAllowedForFediverse: true,
    isAllowedForDiscord: false,
    isAllowedForTwitter: false,
    allowParticipationRequest: true,
    participants: participants.map((p) => ({ ...p, user: { platform: 'mastodon', server: 'example.social' } })),
  }
}

/** 編集画面が送る形。**規約以外は既存のまま**にして、差分を規約だけにする */
function body(terms: string) {
  return {
    title: 'テストイベント',
    description: '',
    hashtags: [],
    startDate: '2026-09-12',
    startTime: '',
    endTime: '',
    location: '',
    fee: '',
    relatedUrl: '',
    terms,
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
  }
}

const ctx = { params: Promise.resolve({ id: 'evt_1' }) }

async function put(terms: string) {
  return PUT(makeRequest('/api/v1/events/evt_1', { method: 'PUT', body: body(terms) }), ctx)
}

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockReset()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.user)
  // 中身は走らせない。ここで見たいのは書き込みの手前の判定
  prismaMock.$transaction.mockResolvedValue(undefined)
  // 編集の差分を出すために読む（通知を出すかの判定。ここでは選択肢なし）
  prismaMock.eventOptionGroup.findMany.mockResolvedValue([])
})

describe('PUT /api/v1/events/[id] の参加規約', () => {
  it('誰も登録していなければ書き換えられる', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event([]))

    expect((await put('新しい規約')).status).toBe(200)
  })

  it.each(['attending', 'maybe', 'participation_request'])(
    '%s の人がいれば拒む',
    async (status) => {
      prismaMock.event.findUnique.mockResolvedValue(event([{ status }]))

      const res = await put('新しい規約')
      expect(res.status).toBe(409)
      const payload = (await res.json()) as { error?: { message: string } }
      expect(payload.error?.message).toContain('参加規約は変更できません')
    }
  )

  /*
    欠席もキャンセルも規約に縛られる立場ではない。数えると
    「一度キャンセルが出たら永久に直せない」ことになる。
  */
  it('欠席とキャンセルだけなら書き換えられる', async () => {
    prismaMock.event.findUnique.mockResolvedValue(
      event([{ status: 'not_attending' }, { status: 'cancelled' }])
    )

    expect((await put('新しい規約')).status).toBe(200)
  })

  /*
    **これを弾くと、規約のあるイベントが何ひとつ編集できなくなる。**
    編集画面は読み取り専用の欄でも同じ値を送り返してくる。
  */
  it('登録者がいても、同じ規約を送り返すだけなら通す', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event([{ status: 'attending' }]))

    expect((await put(TERMS)).status).toBe(200)
  })

  /*
    規約なしで登録が始まったイベントに、後から足せない —
    同意していない内容に同意したことになる人ができる。
  */
  it('登録者がいれば、空だった規約を後から足せない', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event([{ status: 'attending' }], null))

    expect((await put('後から足した規約')).status).toBe(409)
  })

  /*
    **削除だけは通す**（`isAllowedEventTermsChange`）。主催者が自分の求めを
    取り下げるだけで、規約が無くなって不利になる参加者はいない。
    通さないと、規約を消したいだけでイベントを作り直すことになる。
  */
  it('登録者がいても、規約の削除は通す', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event([{ status: 'attending' }]))

    expect((await put('')).status).toBe(200)
  })
})
