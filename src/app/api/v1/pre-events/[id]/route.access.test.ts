import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))
vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), isAdminUser: vi.fn() }))
vi.mock('@/lib/permissions', () => ({
  checkPreEventOrganizerPermission: vi.fn(async () => false),
  checkOrgAdminPermission: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { GET } from './route'

/**
 * 非公開の日程調整（`isPublic: false`）を誰が開けるか。
 *
 * **ログインしているかどうかだけで決まる。** 以前は回答できる
 * プラットフォームの条件まで見ていて、設定の名前
 * （「ログインユーザーのみが閲覧できるようにする」）と食い違っていた。
 * イベント側（`events/[id]` の GET）と同じ規則。
 */

const ID = 'clpreeventxxxxxxxxxxxxxx1'
const args = { params: Promise.resolve({ id: ID }) }

/** Mastodon だけを受け付ける非公開の日程調整 */
function preEventRow() {
  return {
    id: ID,
    title: '歓迎会の日程',
    description: null,
    location: null,
    fee: null,
    relatedUrl: null,
    terms: null,
    isDisabled: false,
    isPublic: false,
    isHighlighted: false,
    allowAutoRegistration: false,
    registrationDeadline: null,
    isAllowedForFediverse: true,
    isAllowedForDiscord: false,
    isAllowedForTwitter: false,
    allowedFediverseServers: JSON.stringify([]),
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    creatorId: 'user_9',
    creator: {
      id: 'user_9',
      username: 'host',
      displayName: '主催',
      avatar: null,
      server: 'example.social',
      platform: 'mastodon',
    },
    organizationId: null,
    organization: null,
    dateOptions: [],
    participants: [],
  }
}

const get = () => GET(makeRequest(`/api/v1/pre-events/${ID}`), args)

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockReset()
  prismaMock.preEvent.findUnique.mockResolvedValue(preEventRow())
})

describe('GET /api/v1/pre-events/[id] の非公開の日程調整', () => {
  it('ログインしていなければ開けない', async () => {
    vi.mocked(getSession).mockResolvedValue(PERSONAS.anonymous)

    expect((await get()).status).toBe(401)
  })

  /*
    **ここが以前 403 だった。** Discord の人は Mastodon 限定の日程調整に
    回答できないが、主催者が閉じたのは「ログインしていない人」だけ。
  */
  it('回答できないプラットフォームでも、ログインしていれば開ける', async () => {
    vi.mocked(getSession).mockResolvedValue({
      ...PERSONAS.user,
      user: { ...PERSONAS.user.user, platform: 'discord', server: 'discord.com' },
    })

    const res = await get()
    expect(res.status).toBe(200)

    // 開けるだけで、回答できるようになるわけではない
    const payload = (await res.json()) as { data: { viewer: { isEligible: boolean } } }
    expect(payload.data.viewer.isEligible).toBe(false)
  })
})
