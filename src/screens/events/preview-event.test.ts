import { describe, expect, it } from 'vitest'

import { eventFormSchema, type EventFormValues } from '@/schemas/event'
import { composeDateTime, composeDeadline } from '@/lib/event-datetime'

import { buildPreviewEvent, PREVIEW_EVENT_ID } from './preview-event'

/**
 * 作成前プレビューは「保存したらこうなる」を見せるもの。
 * **見た目が似ているだけでは足りない。** 日時の解釈がサーバーと1つでも
 * ずれると、プレビューが嘘をつく。
 *
 * ここでは保存側の処理（`api/v1/events` の POST がどう列に入れるか）を
 * 写し取り、シリアライザに通した結果とプレビューを突き合わせる。
 */

const NOW = new Date('2026-07-01T00:00:00Z')

const BASE: EventFormValues = {
  title: 'Fediverse 交流会 2026 夏',
  description: '当日の流れ',
  hashtags: ['fediverse'],
  startDate: '2026-09-12',
  startTime: '',
  endDate: '',
  endTime: '',
  location: '',
  fee: '',
  relatedUrl: '',
  terms: '',
  maxParticipants: null,
  registrationDeadlineDate: '',
  registrationDeadlineTime: '',
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedFediverseServers: [],
  isPublic: true,
  isHighlighted: true,
  allowMaybe: false,
  allowParticipationRequest: true,
  organizationId: '',
  optionGroups: [],
}

function parse(overrides: Partial<EventFormValues>) {
  return eventFormSchema.parse({ ...BASE, ...overrides })
}

/**
 * 保存側の再現。
 *
 * `api/v1/events` の POST は日付をそのまま `new Date()` に通して
 * 日付列へ入れ、時刻は別の文字列列に置く。時刻ありの判定は
 * `!!startTime && startTime !== '00:00'`。
 * 読み出しは `serializers/event.ts` が日付列と時刻列を合成する。
 */
function throughServer(values: ReturnType<typeof parse>) {
  const hasStartTime = !!values.startTime && values.startTime !== '00:00'
  const hasEndTime = !!values.endTime && values.endTime !== '00:00'

  return {
    startDate: composeDateTime(
      new Date(values.startDate),
      values.startTime || null,
      hasStartTime
    ),
    endDate: values.endDate
      ? composeDateTime(new Date(values.endDate), values.endTime || null, hasEndTime)
      : null,
    hasStartTime,
    hasEndTime,
    registrationDeadline: composeDeadline(
      values.registrationDeadlineDate ? new Date(values.registrationDeadlineDate) : null,
      values.registrationDeadlineTime || null
    ),
  }
}

function preview(overrides: Partial<EventFormValues>) {
  return buildPreviewEvent({
    values: parse(overrides),
    viewer: null,
    organization: null,
    now: NOW,
  })
}

describe('buildPreviewEvent の日時', () => {
  const cases: { name: string; input: Partial<EventFormValues> }[] = [
    { name: '日付だけ', input: {} },
    { name: '開始時刻あり', input: { startTime: '19:00' } },
    {
      name: '開始と終了の時刻あり（同日）',
      input: { startTime: '19:00', endDate: '2026-09-12', endTime: '22:00' },
    },
    {
      name: '日をまたぐ（時刻なし）',
      input: { endDate: '2026-09-13' },
    },
    {
      name: '0時開始は「時刻の指定なし」として扱う',
      input: { startTime: '00:00' },
    },
    { name: '締切（時刻なし）', input: { registrationDeadlineDate: '2026-09-10' } },
    {
      name: '締切（時刻あり）',
      input: {
        registrationDeadlineDate: '2026-09-10',
        registrationDeadlineTime: '18:00',
      },
    },
  ]

  for (const { name, input } of cases) {
    it(`${name}：保存して読み直した結果と一致する`, () => {
      const expected = throughServer(parse(input))
      const actual = preview(input)

      expect({
        startDate: actual.startDate,
        endDate: actual.endDate,
        hasStartTime: actual.hasStartTime,
        hasEndTime: actual.hasEndTime,
        registrationDeadline: actual.registrationDeadline,
      }).toEqual(expected)
    })
  }

  it('19:00 と入力したら 19:00 のまま（JST）', () => {
    const e = preview({ startTime: '19:00' })
    expect(e.startDate).toBe('2026-09-12T10:00:00.000Z')
    expect(e.hasStartTime).toBe(true)
  })
})

describe('buildPreviewEvent の中身', () => {
  it('参加者の目線で描く（幹事メニューではなく参加登録が出る形）', () => {
    const e = preview({})
    expect(e.viewer).toEqual({
      isAuthenticated: true,
      isOrganizer: false,
      canCancel: false,
      canChangeOrganization: false,
      participation: null,
      isEligible: true,
      ineligibleReason: null,
    })
  })

  it('まだ誰も参加していない', () => {
    const e = preview({})
    expect(e.participants).toEqual([])
    expect(e.counts).toEqual({ attending: 0, maybe: 0, participationRequest: 0 })
  })

  it('オプションには一意のIDを振る（参加登録モーダルが選択のキーに使う）', () => {
    const e = preview({
      optionGroups: [
        {
          title: '懇親会',
          responseType: 'single',
          options: [{ name: '参加する' }, { name: '参加しない' }],
        },
        {
          title: 'Tシャツ',
          responseType: 'multiple',
          options: [{ name: 'M' }, { name: 'L' }],
        },
      ],
    })

    const ids = e.optionGroups.flatMap((g) => [g.id, ...g.options.map((o) => o.id)])
    expect(new Set(ids).size).toBe(ids.length)
    expect(e.optionGroups[0].options[0].takenCount).toBe(0)
  })

  it('サーバー限定は種別不明として渡す（保存時に外部APIで引かれる）', () => {
    const e = preview({ allowedFediverseServers: ['handon.club'] })
    expect(e.allowedServers).toEqual([{ server: 'handon.club', platform: null }])
  })

  it('実在しないIDだと分かる値を使う', () => {
    expect(preview({}).id).toBe(PREVIEW_EVENT_ID)
  })

  it('未ログインでも主催者名の欄が空にならない', () => {
    expect(preview({}).creator.displayName).toBe('あなた')
  })

  it('空欄は null になる（行ごと出さないため）', () => {
    const e = preview({})
    expect(e.location).toBeNull()
    expect(e.fee).toBeNull()
    expect(e.relatedUrl).toBeNull()
    expect(e.terms).toBeNull()
    expect(e.endDate).toBeNull()
    expect(e.registrationDeadline).toBeNull()
  })
})
