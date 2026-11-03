import { describe, expect, it } from 'vitest'

import { serializeEventDetail } from './event'

const USER = (id: string) => ({
  id,
  username: `u${id}`,
  displayName: `ユーザー${id}`,
  avatar: null,
  server: 'handon.club',
  platform: 'mastodon',
})

const EVENT = {
  id: 'evt_1',
  title: 'テスト',
  description: null,
  hashtags: null,
  startDate: new Date('2026-09-12T10:00:00Z'),
  startTime: '19:00',
  endDate: null,
  endTime: null,
  hasStartTime: true,
  hasEndTime: false,
  location: null,
  fee: null,
  relatedUrl: null,
  terms: '規約',
  status: 'active',
  isPublic: true,
  isHighlighted: true,
  maxParticipants: null,
  registrationDeadlineDate: null,
  registrationDeadlineTime: null,
  allowMaybe: true,
  allowParticipationRequest: true,
  allowedFediverseServers: null,
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
  creator: USER('host'),
  organization: null,
  optionGroups: [
    {
      id: 'g1',
      title: '懇親会',
      responseType: 'single',
      options: [
        { id: 'o1', name: '参加する', maxParticipants: null },
        { id: 'o2', name: '参加しない', maxParticipants: null },
      ],
    },
  ],
  participants: [
    {
      id: 'p_other',
      userId: 'other',
      status: 'cancelled',
      comment: '他人のコメント',
      termsAccepted: true,
      isOrganizer: false,
      user: USER('other'),
      groupSelections: [
        { groupId: 'g1', textAnswer: null, options: [{ option: { id: 'o2', name: '参加しない' } }] },
      ],
    },
    {
      id: 'p_me',
      userId: 'me',
      status: 'cancelled',
      comment: '自分のコメント',
      termsAccepted: true,
      isOrganizer: true,
      user: USER('me'),
      groupSelections: [
        { groupId: 'g1', textAnswer: null, options: [{ option: { id: 'o1', name: '参加する' } }] },
      ],
    },
  ],
}

const viewerInput = (userId: string | null) => ({
  isAuthenticated: userId !== null,
  isOrganizer: false,
  canCancel: false,
  userId,
  isEligible: true,
  ineligibleReason: null,
})

describe('serializeEventDetail の viewer.participation', () => {
  it('自分の記録を userId で引く。状態が同じ他人を掴まない', () => {
    const dto = serializeEventDetail(EVENT, viewerInput('me'))
    expect(dto.viewer.participation).toEqual({
      status: 'cancelled',
      comment: '自分のコメント',
      termsAccepted: true,
      selectedOptionIds: ['o1'],
      optionTextAnswers: {},
    })
  })

  it('キャンセル済みでも記録は残る。再登録は PUT になる', () => {
    const dto = serializeEventDetail(EVENT, viewerInput('me'))
    // status は cancelled（＝表示上は未参加）だが participation は null ではない
    expect(dto.viewer.participation?.status).toBe('cancelled')
    expect(dto.viewer.participation).not.toBeNull()
  })

  it('一度も登録していなければ null', () => {
    expect(serializeEventDetail(EVENT, viewerInput('nobody')).viewer.participation).toBeNull()
  })

  it('未ログインなら null', () => {
    expect(serializeEventDetail(EVENT, viewerInput(null)).viewer.participation).toBeNull()
  })

  it('参加者一覧に機密が混じらない', () => {
    const dto = serializeEventDetail(EVENT, viewerInput('me'))
    const json = JSON.stringify(dto)
    expect(json).not.toContain('accessToken')
    expect(json).not.toContain('ipAddresses')
  })
})

describe('serializeEventDetail の参加者の選択肢', () => {
  /*
    「はい」「いいえ」は名前だけでは何の答えか分からない。質問と組で渡す。
    選択の記録は保存順に並ぶので、人によって順番が入れ替わらないよう
    グループ・選択肢の表示順に並べ直す。
  */
  const event = {
    ...EVENT,
    optionGroups: [
      ...EVENT.optionGroups,
      {
        id: 'g2',
        title: '未成年ですか？',
        responseType: 'single',
        options: [
          { id: 'o3', name: 'はい', maxParticipants: null },
          { id: 'o4', name: 'いいえ', maxParticipants: null },
        ],
      },
    ],
    participants: [
      {
        ...EVENT.participants[0],
        groupSelections: [
          { groupId: 'g2', textAnswer: null, options: [{ option: { id: 'o4', name: 'いいえ' } }] },
          { groupId: 'g1', textAnswer: null, options: [{ option: { id: 'o1', name: '参加する' } }] },
        ],
      },
    ],
  }

  it('質問と組にし、表示順に並べる', () => {
    const dto = serializeEventDetail(event, viewerInput(null))
    expect(dto.participants[0].options).toEqual([
      { question: '懇親会', name: '参加する' },
      { question: '未成年ですか？', name: 'いいえ' },
    ])
  })

  /*
    自由入力の回答も同じ列に混ぜる。見る側にとっては、選んだ答えも
    書いた答えも同じ「この人の回答」で、置き場を分ける理由が無い。
  */
  it('自由入力の回答も、見出しと組にして表示順に混ぜる', () => {
    const withText = {
      ...event,
      optionGroups: [
        event.optionGroups[0],
        { id: 'g3', title: 'どこで知りましたか', responseType: 'text', options: [] },
        event.optionGroups[1],
      ],
      participants: [
        {
          ...event.participants[0],
          groupSelections: [
            { groupId: 'g3', textAnswer: '友人から', options: [] },
            {
              groupId: 'g1',
              textAnswer: null,
              options: [{ option: { id: 'o1', name: '参加する' } }],
            },
          ],
        },
      ],
    }

    const dto = serializeEventDetail(withText, viewerInput('other'))
    expect(dto.participants[0].options).toEqual([
      { question: '懇親会', name: '参加する' },
      { question: 'どこで知りましたか', name: '友人から' },
    ])
    // 変更のときは書いた本文をそのまま戻す
    expect(dto.viewer.participation?.optionTextAnswers).toEqual({ g3: '友人から' })
  })

  it('自由入力のグループは選択肢を持たない', () => {
    const dto = serializeEventDetail(
      {
        ...EVENT,
        optionGroups: [{ id: 'g3', title: 'ひとこと', responseType: 'text', options: [] }],
        participants: [],
      },
      viewerInput(null)
    )
    expect(dto.optionGroups).toEqual([
      { id: 'g3', title: 'ひとこと', responseType: 'text', options: [] },
    ])
  })
})
