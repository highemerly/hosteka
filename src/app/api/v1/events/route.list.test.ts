import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeRequest, PERSONAS, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))

const getSession = vi.fn()
vi.mock('@/server/auth/session', () => ({
  getSession: () => getSession(),
  getSessionClaims: () => getSession(),
  isAdminUser: async () => false,
}))

import { GET } from './route'

/**
 * 一覧の応答。
 *
 * **生の行を返さない。** 生の行を渡すと、`Event` に列を1本足した日に
 * 未ログインのクライアントへ自動で公開される。シリアライザを通すので、
 * 返る鍵をここで固定する。
 */

/** シリアライザが返す鍵。ここに無いものは返ってはいけない */
const EXPECTED_KEYS = [
  'id',
  'title',
  'hashtags',
  'startDate',
  'endDate',
  'hasStartTime',
  'hasEndTime',
  'location',
  'fee',
  'status',
  'maxParticipants',
  'registrationDeadline',
  'attendingCount',
  'attendees',
  'creator',
  'organization',
].sort()

const ROW = {
  id: 'e1',
  title: '勉強会',
  hashtags: JSON.stringify(['tag']),
  startDate: new Date('2026-06-15T10:00:00+09:00'),
  startTime: '19:00',
  endDate: null,
  endTime: null,
  hasStartTime: true,
  hasEndTime: false,
  location: '渋谷',
  fee: '無料',
  status: 'published',
  maxParticipants: 10,
  registrationDeadlineDate: null,
  registrationDeadlineTime: null,
  creator: {
    id: 'user_1',
    username: 'taro',
    displayName: 'テスト太郎',
    avatar: null,
    server: 'example.social',
    platform: 'mastodon',
  },
  organization: null,
  participants: [
    {
      user: {
        id: 'user_2',
        username: 'hanako',
        displayName: 'テスト花子',
        avatar: null,
        server: 'example.social',
        platform: 'mastodon',
      },
    },
  ],
  _count: { participants: 1 },
  // 絞り込みだけに使う列。**応答には出ないこと**
  allowParticipationRequest: false,
  isAllowedForFediverse: true,
  isAllowedForDiscord: true,
  allowedFediverseServers: null,
}

beforeEach(() => {
  resetPrismaMock()
  getSession.mockReset()
  getSession.mockResolvedValue(PERSONAS.anonymous)
  prismaMock.event.findMany.mockResolvedValue([ROW])
  prismaMock.event.count.mockResolvedValue(1)
})

async function list(query = '') {
  const response = await GET(makeRequest(`/api/v1/events${query}`))
  return { status: response.status, body: await response.json() }
}

describe('GET /api/v1/events', () => {
  it('シリアライザが返す鍵だけを返す', async () => {
    const { status, body } = await list()

    expect(status).toBe(200)
    expect(Object.keys(body.data[0]).sort()).toEqual(EXPECTED_KEYS)
  })

  it('絞り込みだけに使う列を応答に出さない', async () => {
    const { body } = await list()
    const item = body.data[0]

    for (const key of [
      'allowParticipationRequest',
      'isAllowedForFediverse',
      'isAllowedForDiscord',
      'allowedFediverseServers',
      'isPublic',
      'isHighlighted',
      'isDisabled',
      'creatorId',
      'terms',
      'participants',
      'options',
      'optionGroups',
    ]) {
      expect(item).not.toHaveProperty(key)
    }
  })

  /*
    日時は「日付列 + 時刻列（"HH:MM"）」で保存されている。**片方だけ読むと
    時刻が落ちる** — 以前それで 19:00 のイベントが一覧でも詳細でも 09:00
    （UTC 0時の JST 表示）になっていた。応答は UTC の ISO なので、
    19:00 JST は 10:00Z。
  */
  it('時刻を落とさない（日付列だけ読むと 19:00 が 09:00 になる）', async () => {
    const { body } = await list()
    expect(body.data[0].startDate).toBe('2026-06-15T10:00:00.000Z')
  })

  it('参加者はアバターに出す分だけ返し、総数は別に数える', async () => {
    const { body } = await list()
    expect(body.data[0].attendingCount).toBe(1)
    expect(body.data[0].attendees).toHaveLength(1)
    expect(Object.keys(body.data[0].attendees[0]).sort()).toEqual(
      ['avatar', 'displayName', 'id', 'platform', 'server', 'username'].sort()
    )
  })

  it('一覧のエンベロープに meta が付く', async () => {
    const { body } = await list()
    expect(body.meta).toMatchObject({ total: 1, page: 1 })
  })

  /** 自分に関わる絞り込みはログインが要る（未ログインは 401） */
  it('未ログインで isCreated を指定すると 401', async () => {
    const { status } = await list('?isCreated=true')
    expect(status).toBe(401)
  })
})

/*
  「参加できるもの」の絞り込み。**終了したかどうかは時刻列まで読んで決める。**
  以前は日付列だけを比べていた。新形式の行は UTC 0時 = 09:00 JST なので、
  19:00 開始のイベントが当日の朝9時から「終了」扱いになり、絞り込みから消えた。
  詳細画面の「終了しました」と同じ瞬間で切る。
*/
describe('GET /api/v1/events?isParticipable=true', () => {
  // 6月15日 19:00 JST 開始。日付列は新形式（UTC 0時）
  const EVENING = { ...ROW, startDate: new Date('2026-06-15T00:00:00Z') }

  async function participable(row: Record<string, unknown>) {
    prismaMock.event.findMany.mockResolvedValue([row])
    const { body } = await list('?isParticipable=true&isParticipated=false')
    return body.data.length === 1
  }

  beforeEach(() => {
    vi.useFakeTimers()
    // 「自分が参加できるか」の絞り込みなので、ログインが要る
    getSession.mockResolvedValue(PERSONAS.user)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('当日の開始前は、まだ終了していない', async () => {
    vi.setSystemTime(new Date('2026-06-15T12:00:00+09:00'))
    expect(await participable(EVENING)).toBe(true)
  })

  it('開始時刻を過ぎたら終了（終了日時が無いイベント）', async () => {
    vi.setSystemTime(new Date('2026-06-15T19:01:00+09:00'))
    expect(await participable(EVENING)).toBe(false)
  })

  it('終了日時があれば、そこまでは終了していない', async () => {
    const row = {
      ...EVENING,
      endDate: new Date('2026-06-15T00:00:00Z'),
      endTime: '21:00',
      hasEndTime: true,
    }
    vi.setSystemTime(new Date('2026-06-15T20:00:00+09:00'))
    expect(await participable(row)).toBe(true)

    vi.setSystemTime(new Date('2026-06-15T21:01:00+09:00'))
    expect(await participable(row)).toBe(false)
  })

  it('締切は JST の時刻で切る。サーバーの時刻帯に寄らない', async () => {
    // 6月14日 18:00 JST が締切
    const row = {
      ...EVENING,
      registrationDeadlineDate: new Date('2026-06-14T00:00:00Z'),
      registrationDeadlineTime: '18:00',
    }
    vi.setSystemTime(new Date('2026-06-14T17:59:00+09:00'))
    expect(await participable(row)).toBe(true)

    vi.setSystemTime(new Date('2026-06-14T18:01:00+09:00'))
    expect(await participable(row)).toBe(false)
  })
})
