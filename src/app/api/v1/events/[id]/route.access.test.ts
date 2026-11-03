import { describe, it, vi, beforeEach, expect } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))
/* 締切超過の「未定」を畳む after() は、handler を直接呼ぶテストからは通せない */
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { GET } from './route'

/**
 * 非公開イベント（`isPublic: false`）を誰が開けるか。
 *
 * **ログインしているかどうかだけで決まる。** 以前は登録できる
 * プラットフォームの条件まで見ていて、設定の名前
 * （「ログインユーザーのみが閲覧できるようにする」）と食い違っていた。
 * 見えるかどうかと登録できるかどうかは別の設定。
 */

/** Mastodon だけを受け付ける非公開イベント */
function event() {
  return {
    id: 'evt_1',
    title: '身内の集まり',
    description: null,
    hashtags: [],
    startDate: new Date('2026-09-12T10:00:00+09:00'),
    startTime: null,
    endDate: null,
    endTime: null,
    location: null,
    fee: null,
    relatedUrl: null,
    terms: null,
    maxParticipants: null,
    registrationDeadline: null,
    registrationDeadlineTime: null,
    status: 'published',
    isDisabled: false,
    isPublic: false,
    isHighlighted: false,
    allowMaybe: true,
    allowParticipationRequest: false,
    isAllowedForFediverse: true,
    isAllowedForDiscord: false,
    isAllowedForTwitter: false,
    allowedFediverseServers: [],
    cancelledAt: null,
    cancelReason: null,
    createdAt: new Date('2026-09-01T00:00:00+09:00'),
    updatedAt: new Date('2026-09-01T00:00:00+09:00'),
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
    participants: [],
    optionGroups: [],
  }
}

const ctx = { params: Promise.resolve({ id: 'evt_1' }) }

const get = () => GET(makeRequest('/api/v1/events/evt_1'), ctx)

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockReset()
  prismaMock.event.findUnique.mockResolvedValue(event())
})

describe('GET /api/v1/events/[id] の非公開イベント', () => {
  it('ログインしていなければ開けない', async () => {
    vi.mocked(getSession).mockResolvedValue(PERSONAS.anonymous)

    expect((await get()).status).toBe(401)
  })

  /*
    **ここが以前 403 だった。** Discord の人は Mastodon 限定のイベントに
    登録できないが、主催者が閉じたのは「ログインしていない人」だけ。
  */
  it('登録できないプラットフォームでも、ログインしていれば開ける', async () => {
    vi.mocked(getSession).mockResolvedValue({
      ...PERSONAS.user,
      user: { ...PERSONAS.user.user, platform: 'discord', server: 'discord.com' },
    })

    const res = await get()
    expect(res.status).toBe(200)

    // 開けるだけで、登録できるようになるわけではない
    const payload = (await res.json()) as { data: { viewer: { isEligible: boolean } } }
    expect(payload.data.viewer.isEligible).toBe(false)
  })
})
