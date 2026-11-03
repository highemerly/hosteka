import { describe, expect, it } from 'vitest'

import {
  notifiableEventChanges,
  optionGroupsSignature,
  type EventChangeInput,
  type OptionGroupShape,
} from './event-change'
import { COLUMN_FIELD, EVENT_CHANGE_LABELS, EXTRA_FIELD } from './event-notify-fields'
import { EVENT_FORM_FIELDS, type EventColumns } from './event-write'

/**
 * 編集で何が変わったか。
 *
 * **編集はすべて知らせる。** ここが止めるのは「何も変わっていない保存」だけ。
 * 壊れると「毎回通知が飛ぶ」か「二度と飛ばない」のどちらかになり、
 * どちらも画面からは分からない。
 */
const COLUMNS: EventColumns = {
  title: '花見の会',
  description: '本文',
  hashtags: null,
  startDate: new Date('2026-10-01T00:00:00+09:00'),
  startTime: '19:00',
  hasStartTime: true,
  endDate: null,
  endTime: null,
  hasEndTime: false,
  location: '上野公園',
  maxParticipants: 20,
  isPublic: true,
  isHighlighted: false,
  registrationDeadlineDate: new Date('2026-09-25T00:00:00+09:00'),
  registrationDeadlineTime: '23:59',
  hasRegistrationDeadlineTime: true,
  fee: '2000円',
  relatedUrl: null,
  allowMaybe: true,
  allowParticipationRequest: true,
}

const EXTRAS: EventChangeInput['extras'] = {
  terms: null,
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedServers: ['handon.club'],
  organizationId: null,
}

const GROUPS: OptionGroupShape[] = [
  { title: '飲み物', responseType: 'single', options: [{ name: 'ビール', maxParticipants: 10 }] },
]

function input(
  columns: Partial<EventColumns> = {},
  extras: Partial<EventChangeInput['extras']> = {},
  optionGroups: OptionGroupShape[] = GROUPS
): EventChangeInput {
  return {
    columns: { ...COLUMNS, ...columns },
    extras: { ...EXTRAS, ...extras },
    optionGroups,
  }
}

describe('項目の名前', () => {
  /** 片方だけ足すと、写し取られるのに名前の無い項目ができる */
  it('フォームの全項目に日本語名がある', () => {
    expect(Object.keys(EVENT_CHANGE_LABELS).sort()).toEqual(Object.keys(EVENT_FORM_FIELDS).sort())
    for (const [field, label] of Object.entries(EVENT_CHANGE_LABELS)) {
      expect(label, field).toBeTruthy()
    }
  })

  it('すべての列とすべての追加項目がフォームの項目に対応づいている', () => {
    for (const field of [...Object.values(COLUMN_FIELD), ...Object.values(EXTRA_FIELD)]) {
      expect(EVENT_CHANGE_LABELS[field], field).toBeTruthy()
    }
  })

  /** `eventColumnsFromForm` が作らない項目を数え漏らすと、規約を変えても届かない */
  it('ルートが個別に書く項目も比較の対象に入っている', () => {
    const perRoute = Object.entries(EVENT_FORM_FIELDS)
      .filter(([, d]) => d.kind === 'per-route')
      .map(([field]) => field)
    expect(perRoute.sort()).toEqual(Object.values(EXTRA_FIELD).sort())
  })
})

describe('変わっていなければ何も返さない', () => {
  /** 編集画面は開いて保存すると全項目を送り返してくる */
  it('同じ内容なら空', () => {
    expect(notifiableEventChanges(input(), input())).toEqual([])
  })

  /**
   * 開いて保存しただけで全参加者に通知が飛ぶ事故。
   * `Date` を `!==` で比べると必ずこうなる
   */
  it('同じ日時の別インスタンスを「変わった」としない', () => {
    const before = input()
    const after = input({
      startDate: new Date('2026-10-01T00:00:00+09:00'),
      registrationDeadlineDate: new Date('2026-09-25T00:00:00+09:00'),
    })
    expect(before.columns.startDate).not.toBe(after.columns.startDate)
    expect(notifiableEventChanges(before, after)).toEqual([])
  })

  /** 並び順は主催者が決めたものではない（保存のたびに組み直される） */
  it('許可サーバーの並び順や重複だけでは変わったとしない', () => {
    expect(
      notifiableEventChanges(
        input({}, { allowedServers: ['a.example', 'b.example'] }),
        input({}, { allowedServers: ['b.example', 'a.example', 'a.example'] })
      )
    ).toEqual([])
  })
})

describe('変わった項目の名前を返す', () => {
  /** 名前を変えただけの編集が誰にも届かなかったので、知らせる側へ移した */
  it('タイトルを変えたら「名前」', () => {
    expect(notifiableEventChanges(input(), input({ title: '花見の会（改）' }))).toEqual(['名前'])
  })

  it('説明を直したら「説明」', () => {
    expect(notifiableEventChanges(input(), input({ description: '本文（修正）' }))).toEqual([
      '説明',
    ])
  })

  it('日時・場所・会費・締切・定員・受け付ける回答', () => {
    expect(notifiableEventChanges(input(), input({ startTime: '18:00' }))).toEqual(['日時'])
    expect(notifiableEventChanges(input(), input({ location: '代々木公園' }))).toEqual(['場所'])
    expect(notifiableEventChanges(input(), input({ fee: '3000円' }))).toEqual(['会費'])
    expect(notifiableEventChanges(input(), input({ registrationDeadlineTime: '12:00' }))).toEqual([
      '締切',
    ])
    expect(notifiableEventChanges(input(), input({ maxParticipants: 30 }))).toEqual(['定員'])
    expect(notifiableEventChanges(input(), input({ allowMaybe: false }))).toEqual([
      '受け付ける回答',
    ])
  })

  /** ここが漏れていると、規約や参加できる人を変えても誰にも届かない */
  it('ルートが個別に書く項目も拾う', () => {
    expect(notifiableEventChanges(input(), input({}, { terms: '新しい規約' }))).toEqual([
      '参加規約',
    ])
    expect(notifiableEventChanges(input(), input({}, { isAllowedForDiscord: true }))).toEqual([
      '参加できる人',
    ])
    expect(notifiableEventChanges(input(), input({}, { allowedServers: [] }))).toEqual([
      '参加できる人',
    ])
    expect(notifiableEventChanges(input(), input({}, { organizationId: 'org_1' }))).toEqual([
      '主催の名義',
    ])
  })

  /** 開始日と開始時刻はどちらも「日時」。2つ出てはいけない */
  it('同じ名前の項目が複数変わっても1つにまとめる', () => {
    expect(
      notifiableEventChanges(
        input(),
        input({ startDate: new Date('2026-10-02T00:00:00+09:00'), startTime: '18:00' })
      )
    ).toEqual(['日時'])
  })

  it('複数変わればすべて並べる', () => {
    expect(
      notifiableEventChanges(input(), input({ title: '別の名前', startTime: '18:00' }))
    ).toEqual(['名前', '日時'])
  })

  /** 時刻を消した編集は has*Time だけが変わることがある */
  it('時刻の指定をやめたことも拾う', () => {
    expect(notifiableEventChanges(input(), input({ startTime: null, hasStartTime: false }))).toEqual(
      ['日時']
    )
  })
})

describe('選択肢', () => {
  it('選択肢が増えれば「選択肢」', () => {
    expect(
      notifiableEventChanges(
        input(),
        input({}, {}, [
          {
            title: '飲み物',
            responseType: 'single',
            options: [
              { name: 'ビール', maxParticipants: 10 },
              { name: 'お茶', maxParticipants: null },
            ],
          },
        ])
      )
    ).toEqual(['選択肢'])
  })

  /** 並び順は画面にそのまま出るので、入れ替えも変更 */
  it('並べ替えも変更として扱う', () => {
    const a: OptionGroupShape[] = [
      { title: 'A', responseType: 'single', options: [{ name: '1' }] },
      { title: 'B', responseType: 'single', options: [{ name: '2' }] },
    ]
    expect(optionGroupsSignature(a)).not.toBe(optionGroupsSignature([a[1], a[0]]))
  })

  /** 区切り文字を発明すると、見出しに同じ字が入ったときに壊れる */
  it('見出しに記号が入っても混ざらない', () => {
    expect(
      optionGroupsSignature([{ title: 'A", "B', responseType: 'single', options: [{ name: '1' }] }])
    ).not.toBe(
      optionGroupsSignature([
        { title: 'A', responseType: 'single', options: [{ name: '1' }] },
        { title: 'B', responseType: 'single', options: [{ name: '1' }] },
      ])
    )
  })

  it('定員の未指定と null を同じものとして扱う', () => {
    expect(
      optionGroupsSignature([{ title: 'A', responseType: 'single', options: [{ name: '1' }] }])
    ).toBe(
      optionGroupsSignature([
        { title: 'A', responseType: 'single', options: [{ name: '1', maxParticipants: null }] },
      ])
    )
  })
})
