import { describe, expect, it } from 'vitest'

import {
  dateOptionsSignature,
  notifiablePreEventChanges,
  type PreEventChangeInput,
} from './pre-event-change'
import { PRE_EVENT_CHANGE_LABELS } from './pre-event-notify-fields'

const BASE: PreEventChangeInput = {
  title: '歓迎会の日程',
  description: '本文',
  hashtags: '["花見"]',
  location: '上野公園',
  fee: '2000円',
  relatedUrl: null,
  terms: null,
  registrationDeadline: new Date('2026-09-25T23:59:00+09:00'),
  allowAutoRegistration: false,
  isPublic: true,
  isHighlighted: false,
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedServers: ['handon.club'],
  organizationId: null,
  dateOptions: [
    { startDate: new Date('2026-10-01T19:00:00+09:00'), endDate: null },
    { startDate: new Date('2026-10-02T19:00:00+09:00'), endDate: null },
  ],
}

function input(overrides: Partial<PreEventChangeInput> = {}): PreEventChangeInput {
  return { ...BASE, ...overrides }
}

describe('日程調整の編集で何が変わったか', () => {
  it('すべての項目に日本語名がある', () => {
    for (const [field, label] of Object.entries(PRE_EVENT_CHANGE_LABELS)) {
      expect(label, field).toBeTruthy()
    }
  })

  /** 編集画面は開いて保存すると全項目を送り返してくる */
  it('同じ内容なら空', () => {
    expect(notifiablePreEventChanges(input(), input())).toEqual([])
  })

  it('同じ日時の別インスタンスを「変わった」としない', () => {
    const after = input({
      registrationDeadline: new Date('2026-09-25T23:59:00+09:00'),
      dateOptions: [
        { startDate: new Date('2026-10-01T19:00:00+09:00'), endDate: null },
        { startDate: new Date('2026-10-02T19:00:00+09:00'), endDate: null },
      ],
    })
    expect(notifiablePreEventChanges(input(), after)).toEqual([])
  })

  it('許可サーバーの並び順だけでは変わったとしない', () => {
    expect(
      notifiablePreEventChanges(
        input({ allowedServers: ['a.example', 'b.example'] }),
        input({ allowedServers: ['b.example', 'a.example'] })
      )
    ).toEqual([])
  })

  /** 候補が動いたら、もう答えた人は答え直す必要がある */
  it('候補日が増えれば「候補日」', () => {
    expect(
      notifiablePreEventChanges(
        input(),
        input({
          dateOptions: [
            ...BASE.dateOptions,
            { startDate: new Date('2026-10-03T19:00:00+09:00'), endDate: null },
          ],
        })
      )
    ).toEqual(['候補日'])
  })

  it('名前・説明も知らせる', () => {
    expect(notifiablePreEventChanges(input(), input({ title: '歓迎会（改）' }))).toEqual(['名前'])
    expect(notifiablePreEventChanges(input(), input({ description: '本文（修正）' }))).toEqual([
      '説明',
    ])
  })

  it('ハッシュタグは足しても、並べ替えても知らせる', () => {
    expect(notifiablePreEventChanges(input(), input({ hashtags: '["花見","上野"]' }))).toEqual([
      'ハッシュタグ',
    ])
    expect(
      notifiablePreEventChanges(
        input({ hashtags: '["花見","上野"]' }),
        input({ hashtags: '["上野","花見"]' })
      )
    ).toEqual(['ハッシュタグ'])
  })

  it('締切・場所・会費', () => {
    expect(notifiablePreEventChanges(input(), input({ location: '代々木公園' }))).toEqual(['場所'])
    expect(notifiablePreEventChanges(input(), input({ fee: '3000円' }))).toEqual(['会費'])
    expect(notifiablePreEventChanges(input(), input({ registrationDeadline: null }))).toEqual([
      '締切',
    ])
  })

  it('規約・参加できる人・主催の名義も拾う', () => {
    expect(notifiablePreEventChanges(input(), input({ terms: '新しい規約' }))).toEqual(['参加規約'])
    expect(notifiablePreEventChanges(input(), input({ isAllowedForDiscord: true }))).toEqual([
      '参加できる人',
    ])
    expect(notifiablePreEventChanges(input(), input({ organizationId: 'org_1' }))).toEqual([
      '主催の名義',
    ])
  })

  it('複数変わればすべて並べる', () => {
    expect(
      notifiablePreEventChanges(input(), input({ location: '代々木公園', fee: '3000円' }))
    ).toEqual(['場所', '会費'])
  })

  /** 並び順は画面にそのまま出る */
  it('候補日の並べ替えも変更として扱う', () => {
    expect(dateOptionsSignature(BASE.dateOptions)).not.toBe(
      dateOptionsSignature([BASE.dateOptions[1], BASE.dateOptions[0]])
    )
  })
})
