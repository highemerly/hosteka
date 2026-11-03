import { describe, expect, it } from 'vitest'

import { serializePreEventDetail, serializePreEventListItem } from './pre-event'

const USER = (id: string) => ({
  id,
  username: `u${id}`,
  displayName: `ユーザー${id}`,
  avatar: null,
  server: 'handon.club',
  platform: 'mastodon',
  // Prisma が返しうる機密。DTOに出てはならない
  accessToken: 'enc:v1:SECRET',
  ipAddresses: '["203.0.113.1"]',
})

const ROW = {
  id: 'pre_1',
  title: '日程を決める',
  description: null,
  location: null,
  fee: null,
  relatedUrl: null,
  terms: null,
  isPublic: true,
  isHighlighted: true,
  allowAutoRegistration: false,
  registrationDeadline: null,
  allowedFediverseServers: null,
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
  creator: USER('host'),
  organization: null,
  dateOptions: [
    { id: 'd1', startDate: new Date('2026-09-14T10:00:00Z'), endDate: null, displayOrder: 0 },
    { id: 'd2', startDate: new Date('2026-09-20T10:00:00Z'), endDate: null, displayOrder: 1 },
  ],
  participants: [
    { userId: 'me', dateOptionId: 'd1', status: 'available', comment: 'よろしく', autoRegisterWhenPromoted: true, createdAt: new Date('2026-07-02T00:00:00Z'), user: USER('me') },
    { userId: 'me', dateOptionId: 'd2', status: 'unavailable', comment: 'よろしく', autoRegisterWhenPromoted: true, createdAt: new Date('2026-07-02T00:00:00Z'), user: USER('me') },
    { userId: 'other', dateOptionId: 'd1', status: 'maybe', comment: null, autoRegisterWhenPromoted: false, createdAt: new Date('2026-07-01T12:00:00Z'), user: USER('other') },
    { userId: 'other', dateOptionId: 'd2', status: 'available', comment: null, autoRegisterWhenPromoted: false, createdAt: new Date('2026-07-01T12:00:00Z'), user: USER('other') },
  ],
}

const viewer = (userId: string | null) => ({
  isAuthenticated: userId !== null,
  isOrganizer: false,
  canDelete: false,
  userId,
  isEligible: true,
  ineligibleReason: null,
})

describe('serializePreEventDetail', () => {
  it('候補日ごとに回答を集計する', () => {
    const dto = serializePreEventDetail(ROW, viewer(null))
    expect(dto.dateOptions[0].counts).toEqual({ available: 1, maybe: 1, unavailable: 0 })
    expect(dto.dateOptions[1].counts).toEqual({ available: 1, maybe: 0, unavailable: 1 })
  })

  it('×の人は名前を出さない。出席できない人の一覧に意味がない', () => {
    const dto = serializePreEventDetail(ROW, viewer(null))
    expect(dto.dateOptions[1].attendees.map((a) => a.user.id)).toEqual(['other'])
  })

  it('回答者は実人数で数える。行は日程×人で増える', () => {
    // 参加行は4つあるが、答えたのは2人
    expect(serializePreEventDetail(ROW, viewer(null)).respondentCount).toBe(2)
  })

  /*
    コメントは回答ごとに1つで、候補日の側に置き場が無い。
    **ここに出さないと画面のどこにも出せない**（実際そうなっていた）。
  */
  it('回答者ごとにコメントと○△×をまとめる', () => {
    const dto = serializePreEventDetail(ROW, viewer(null))
    const me = dto.respondents.find((r) => r.user.id === 'me')
    expect(me?.comment).toBe('よろしく')
    expect(me?.votes).toEqual({ d1: 'available', d2: 'unavailable' })
  })

  it('回答者は先に答えた順に並べる', () => {
    const dto = serializePreEventDetail(ROW, viewer(null))
    expect(dto.respondents.map((r) => r.user.id)).toEqual(['other', 'me'])
  })

  it('×だけの人も回答者には出す。決めるための材料になる', () => {
    const dto = serializePreEventDetail(
      {
        ...ROW,
        participants: [
          { userId: 'no', dateOptionId: 'd1', status: 'unavailable', comment: '両日とも無理です', autoRegisterWhenPromoted: false, createdAt: new Date('2026-07-03T00:00:00Z'), user: USER('no') },
        ],
      },
      viewer(null)
    )
    expect(dto.respondents).toHaveLength(1)
    expect(dto.respondents[0].comment).toBe('両日とも無理です')
    // 候補日の下のアバターには出さない（○と△だけ）
    expect(dto.dateOptions[0].attendees).toEqual([])
  })

  it('自分の回答を候補日ごとに引ける', () => {
    const dto = serializePreEventDetail(ROW, viewer('me'))
    expect(dto.viewer.response).toEqual({
      votes: { d1: 'available', d2: 'unavailable' },
      comment: 'よろしく',
      autoRegisterWhenPromoted: true,
    })
  })

  it('一度も答えていなければ null', () => {
    expect(serializePreEventDetail(ROW, viewer('nobody')).viewer.response).toBeNull()
    expect(serializePreEventDetail(ROW, viewer(null)).viewer.response).toBeNull()
  })

  it('機密が混じらない', () => {
    const json = JSON.stringify(serializePreEventDetail(ROW, viewer('me')))
    expect(json).not.toContain('accessToken')
    expect(json).not.toContain('ipAddresses')
  })
})

describe('serializePreEventListItem', () => {
  it('回答者を実人数で数え、アバターは重複させない', () => {
    const dto = serializePreEventListItem(ROW)
    expect(dto.respondentCount).toBe(2)
    expect(dto.respondents.map((u) => u.id)).toEqual(['me', 'other'])
  })

  it('候補日をそのまま返す', () => {
    expect(serializePreEventListItem(ROW).dateOptions).toHaveLength(2)
  })

  it('機密が混じらない', () => {
    expect(JSON.stringify(serializePreEventListItem(ROW))).not.toContain('accessToken')
  })
})
