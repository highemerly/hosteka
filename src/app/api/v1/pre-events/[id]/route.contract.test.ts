import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))
vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), isAdminUser: vi.fn() }))
vi.mock('@/lib/permissions', () => ({
  checkPreEventOrganizerPermission: vi.fn(),
  checkOrgAdminPermission: vi.fn(),
}))
vi.mock('@/lib/instance-platform', () => ({ enrichServersWithPlatform: vi.fn(async () => []) }))

import { getSession } from '@/server/auth/session'
import { checkPreEventOrganizerPermission } from '@/lib/permissions'
import { PUT } from './route'

const ID = 'clpreeventxxxxxxxxxxxxxx1'
const args = { params: Promise.resolve({ id: ID }) }

/**
 * 参加規約は**回答した人が1人もいないうちだけ変えられる。**
 *
 * 回答した人が同意した内容なので、後から書き換えられては困る。イベント側
 * （`events/[id]` の PUT）と同じ規則で、画面も同じ判定でロックする
 * （`PreEventFormScreen` の `termsLocked`）。
 *
 * **この規則は本文を見ただけでは分からない。** 誰が回答しているかで
 * 通る／通らないが変わるので、ここで固定する。
 */
function preEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    isDisabled: false,
    creatorId: PERSONAS.user.user.id,
    organizationId: null,
    allowedFediverseServers: JSON.stringify([]),
    isAllowedForFediverse: true,
    isAllowedForDiscord: false,
    isAllowedForTwitter: false,
    terms: null,
    // 応答（更新後の詳細）を組み立てるのに要るもの
    title: '歓迎会の日程',
    description: null,
    location: null,
    fee: null,
    relatedUrl: null,
    isPublic: true,
    isHighlighted: false,
    allowAutoRegistration: false,
    registrationDeadline: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    creator: {
      id: PERSONAS.user.user.id,
      username: 'taro',
      displayName: 'テスト太郎',
      avatar: null,
      server: 'example.social',
      platform: 'mastodon',
    },
    organization: null,
    dateOptions: [],
    participants: [],
    ...overrides,
  }
}

const BODY = {
  title: '歓迎会の日程',
  terms: '### 新しい規約\n- 遅刻厳禁',
  dateOptions: [{ startDate: '2026-09-20T10:00:00.000Z', endDate: null }],
  registrationDeadline: null,
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedFediverseServers: [],
  allowAutoRegistration: false,
  isPublic: true,
  isHighlighted: false,
}

/** 更新で実際に書かれた data を取り出す */
function updateData(): Record<string, unknown> {
  return prismaMock.preEvent.update.mock.calls[0][0].data
}

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.user)
  vi.mocked(checkPreEventOrganizerPermission).mockResolvedValue(true)
  prismaMock.preEventParticipant.findMany.mockResolvedValue([])
  prismaMock.preEventDateOption.findMany.mockResolvedValue([])
  prismaMock.preEventDateOption.create.mockResolvedValue({ id: 'opt_new' })
  prismaMock.preEventDateOption.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.preEvent.update.mockResolvedValue({ id: ID })
})

/** 回答者。日程調整は「1人につき候補日の数だけ行」を持つ（PUT は distinct で引く） */
function respondent(userId = 'clrespondentxxxxxxxxxxxx1') {
  return { userId, user: { platform: 'mastodon', server: 'example.social' } }
}

describe('PUT /api/v1/pre-events/[id] の参加規約', () => {
  it('誰も回答していなければ、送られた規約を保存する', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue(preEventRow({ terms: null }))

    await PUT(makeRequest(`/api/v1/pre-events/${ID}`, { method: 'PUT', body: BODY }), args)

    expect(updateData().terms).toBe('### 新しい規約\n- 遅刻厳禁')
  })

  it('誰も回答していなければ、既にある規約も書き換えられる', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue(
      preEventRow({ terms: '### もとの規約\n- 直せる' })
    )

    await PUT(makeRequest(`/api/v1/pre-events/${ID}`, { method: 'PUT', body: BODY }), args)

    expect(updateData().terms).toBe('### 新しい規約\n- 遅刻厳禁')
  })

  it('回答した人がいれば、規約の書き換えを拒む', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue(
      preEventRow({ terms: '### もとの規約\n- 変えない' })
    )
    prismaMock.preEventParticipant.findMany.mockResolvedValue([respondent()])

    const res = await PUT(
      makeRequest(`/api/v1/pre-events/${ID}`, { method: 'PUT', body: BODY }),
      args
    )

    expect(res.status).toBe(409)
    const payload = (await res.json()) as { error?: { message: string } }
    expect(payload.error?.message).toContain('参加規約は変更できません')
    // **黙って捨てない。** 拒むのだから、他の項目も書かない
    expect(prismaMock.preEvent.update).not.toHaveBeenCalled()
  })

  /*
    **これを弾くと、規約のある日程調整が何ひとつ編集できなくなる。**
    編集画面は読み取り専用の欄でも同じ値を送り返してくる。
  */
  it('回答した人がいても、同じ規約を送り返すだけなら通す', async () => {
    const terms = '### もとの規約\n- 変えない'
    prismaMock.preEvent.findUnique.mockResolvedValue(preEventRow({ terms }))
    prismaMock.preEventParticipant.findMany.mockResolvedValue([respondent()])

    await PUT(
      makeRequest(`/api/v1/pre-events/${ID}`, { method: 'PUT', body: { ...BODY, terms } }),
      args
    )

    expect(updateData().terms).toBe(terms)
  })

  /*
    規約なしで回答が始まった日程調整に、後から足せない —
    同意していない内容に同意したことになる人ができる。
  */
  it('回答した人がいれば、空だった規約を後から足せない', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue(preEventRow({ terms: null }))
    prismaMock.preEventParticipant.findMany.mockResolvedValue([respondent()])

    const res = await PUT(
      makeRequest(`/api/v1/pre-events/${ID}`, { method: 'PUT', body: BODY }),
      args
    )

    expect(res.status).toBe(409)
  })

  it('規約が空文字で送られてきたら null にする', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue(preEventRow({ terms: null }))

    await PUT(
      makeRequest(`/api/v1/pre-events/${ID}`, { method: 'PUT', body: { ...BODY, terms: '   ' } }),
      args
    )

    expect(updateData().terms).toBeNull()
  })

  /*
    **削除だけは通す**（`isAllowedPreEventTermsChange`）。主催者が自分の
    求めを取り下げるだけで、規約が無くなって不利になる回答者はいない。
    通さないと、規約を消したいだけで日程調整を作り直すことになる。
  */
  it('回答した人がいても、規約の削除は通す', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue(
      preEventRow({ terms: '### もとの規約\n- 消したい' })
    )
    prismaMock.preEventParticipant.findMany.mockResolvedValue([respondent()])

    await PUT(
      makeRequest(`/api/v1/pre-events/${ID}`, { method: 'PUT', body: { ...BODY, terms: '' } }),
      args
    )

    expect(updateData().terms).toBeNull()
  })
})

/**
 * **グループ（主催の名義）を変えられるのは作成者だけ**（`canChangeOrganization`）。
 * スタッフに許すと、自分のグループへ付け替えて削除（回答ごと消える）の権限を取れる。
 */
describe('PUT /api/v1/pre-events/[id] のグループ', () => {
  const SOMEONE_ELSE = 'clcreatorxxxxxxxxxxxxxxx1'

  beforeEach(() => {
    // 付け替え先のグループでは、閲覧者はスタッフ
    prismaMock.organizationAdmin.findUnique.mockResolvedValue({ role: 'staff' })
  })

  async function put(organizationId: string) {
    return PUT(
      makeRequest(`/api/v1/pre-events/${ID}`, { method: 'PUT', body: { ...BODY, organizationId } }),
      args
    )
  }

  it('スタッフは、自分が管理するグループへ付け替えられない', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue(
      preEventRow({ creatorId: SOMEONE_ELSE, organizationId: 'org_theirs' })
    )

    expect((await put('org_mine')).status).toBe(403)
    expect(prismaMock.preEvent.update).not.toHaveBeenCalled()
  })

  it('スタッフは、グループから外せない', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue(
      preEventRow({ creatorId: SOMEONE_ELSE, organizationId: 'org_theirs' })
    )

    expect((await put('')).status).toBe(403)
  })

  it('作成者は、自分が管理するグループへ付け替えられる', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue(preEventRow())

    await put('org_mine')

    expect(updateData().organizationId).toBe('org_mine')
  })
})
