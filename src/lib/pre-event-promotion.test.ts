import { describe, expect, it } from 'vitest'

import {
  eventDateFieldsFromOption,
  promotionCapacityError,
  promotionFixedValues,
  promotionMismatches,
  selectAutoRegistrants,
  type PromotionAnswer,
  type PromotionSource,
} from './pre-event-promotion'

describe('eventDateFieldsFromOption', () => {
  it('時刻なしの候補（0時で保存）は時刻なしの開催日になる', () => {
    expect(eventDateFieldsFromOption({ startDate: '2026-12-11T15:00:00.000Z', endDate: null })).toEqual({
      startDate: '2026-12-12',
      startTime: '',
      endDate: '',
      endTime: '',
    })
  })

  it('同じ日の時間帯は、終了日も書く（書かないとイベントは終了時刻を捨てる）', () => {
    expect(
      eventDateFieldsFromOption({
        startDate: new Date('2026-12-12T19:00:00+09:00'),
        endDate: new Date('2026-12-12T21:00:00+09:00'),
      })
    ).toEqual({ startDate: '2026-12-12', startTime: '19:00', endDate: '2026-12-12', endTime: '21:00' })
  })

  it('日をまたぐ候補は翌日に終わる', () => {
    expect(
      eventDateFieldsFromOption({
        startDate: '2026-12-13T13:00:00.000Z',
        endDate: '2026-12-13T17:00:00.000Z',
      })
    ).toEqual({ startDate: '2026-12-13', startTime: '22:00', endDate: '2026-12-14', endTime: '02:00' })
  })

  it('時刻を決めていない複数日の候補は、日付だけになる', () => {
    expect(
      eventDateFieldsFromOption({
        startDate: '2026-12-25T15:00:00.000Z',
        endDate: '2026-12-27T15:00:00.000Z',
      })
    ).toEqual({ startDate: '2026-12-26', startTime: '', endDate: '2026-12-28', endTime: '' })
  })
})

const SOURCE: PromotionSource = {
  terms: '写真を公開することがあります',
  organizationId: 'org_1',
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedServers: ['handon.club', 'mstdn.jp'],
}

const OPTION = {
  startDate: new Date('2026-12-12T19:00:00+09:00'),
  endDate: new Date('2026-12-12T21:00:00+09:00'),
}

describe('promotionMismatches', () => {
  const form = () => ({
    ...promotionFixedValues(SOURCE, OPTION),
    // 空欄の表し方はフォームの出力（undefined）に寄せる
  })

  it('日程調整から写した値なら食い違いは無い', () => {
    expect(promotionMismatches(form(), SOURCE, OPTION)).toEqual([])
  })

  it('空欄の表し方・規約の前後の空白・サーバーの並び順は違いとして数えない', () => {
    const noTime = { startDate: '2026-12-11T15:00:00.000Z', endDate: null }
    expect(
      promotionMismatches(
        {
          ...promotionFixedValues(SOURCE, noTime),
          startTime: undefined,
          endDate: undefined,
          endTime: undefined,
          terms: `  ${SOURCE.terms}\n`,
          allowedFediverseServers: ['mstdn.jp', 'handon.club'],
        },
        SOURCE,
        noTime
      )
    ).toEqual([])
  })

  it('日時を候補日から変えると断る', () => {
    expect(promotionMismatches({ ...form(), startTime: '18:00' }, SOURCE, OPTION)).toEqual(['startTime'])
    expect(promotionMismatches({ ...form(), startDate: '2026-12-13' }, SOURCE, OPTION)).toEqual([
      'startDate',
    ])
  })

  it('規約は変えられない。消すことも、無い規約を足すこともできない', () => {
    expect(promotionMismatches({ ...form(), terms: '' }, SOURCE, OPTION)).toEqual(['terms'])
    const noTerms = { ...SOURCE, terms: null }
    expect(
      promotionMismatches({ ...promotionFixedValues(noTerms, OPTION), terms: '足した規約' }, noTerms, OPTION)
    ).toEqual(['terms'])
  })

  it('参加できる人と主催の名義は変えられない', () => {
    expect(
      promotionMismatches(
        {
          ...form(),
          isAllowedForDiscord: true,
          allowedFediverseServers: ['handon.club'],
          organizationId: '',
        },
        SOURCE,
        OPTION
      )
    ).toEqual(['organizationId', 'isAllowedForDiscord', 'allowedFediverseServers'])
  })
})

describe('selectAutoRegistrants', () => {
  const answer = (over: Partial<PromotionAnswer> = {}): PromotionAnswer => ({
    userId: 'u1',
    dateOptionId: 'd1',
    status: 'available',
    autoRegisterWhenPromoted: true,
    termsAcceptedAt: new Date('2026-10-01T00:00:00Z'),
    user: { platform: 'mastodon', server: 'handon.club' },
    ...over,
  })
  const pick = (answers: PromotionAnswer[], source = SOURCE) =>
    selectAutoRegistrants(answers, { dateOptionId: 'd1', creatorId: 'host', source }).map(
      (a) => a.userId
    )

  it('選んだ日に○を付けて、自動登録を選んだ人を登録する', () => {
    expect(pick([answer()])).toEqual(['u1'])
  })

  it('△や×の人、ほかの日に○を付けた人は登録しない', () => {
    expect(
      pick([
        answer({ userId: 'maybe', status: 'maybe' }),
        answer({ userId: 'no', status: 'unavailable' }),
        answer({ userId: 'other-day', dateOptionId: 'd2' }),
      ])
    ).toEqual([])
  })

  it('自動登録を選んでいない人は登録しない', () => {
    expect(pick([answer({ autoRegisterWhenPromoted: false })])).toEqual([])
  })

  it('規約があるのに同意を記録していない人（同意を取り始める前の回答）は登録しない', () => {
    expect(pick([answer({ termsAcceptedAt: null })])).toEqual([])
  })

  it('規約が無ければ同意は見ない', () => {
    expect(pick([answer({ termsAcceptedAt: null })], { ...SOURCE, terms: null })).toEqual(['u1'])
  })

  it('いまの参加条件を満たさない人は登録しない（回答のあとで狭められた）', () => {
    expect(
      pick([
        answer({ userId: 'other-server', user: { platform: 'mastodon', server: 'example.com' } }),
        answer({ userId: 'discord', user: { platform: 'discord', server: 'discord.com' } }),
      ])
    ).toEqual([])
  })

  it('主催者本人は登録しない', () => {
    expect(pick([answer({ userId: 'host' })])).toEqual([])
  })
})

describe('promotionCapacityError', () => {
  it('定員が自動登録の人数に足りなければ止める', () => {
    expect(promotionCapacityError(2, 3)).toContain('3人以上')
  })

  it('足りている・定員なしなら止めない', () => {
    expect(promotionCapacityError(3, 3)).toBeNull()
    expect(promotionCapacityError(null, 100)).toBeNull()
    expect(promotionCapacityError(undefined, 100)).toBeNull()
  })
})
