import { describe, expect, it } from 'vitest'

import { eventFormSchema } from '@/schemas/event'

import { EVENT_FORM_FIELDS, eventColumnsFromForm } from './event-write'

/** 全部の欄が埋まったフォーム。**空にしない** — null は写しても null で通る */
const FULL = eventFormSchema.parse({
  title: 'Fediverse 交流会 2026 夏',
  description: '### 当日の流れ\n- 19:00 開場',
  hashtags: ['fediverse', 'オフ会'],
  startDate: '2026-09-12',
  startTime: '19:00',
  endDate: '2026-09-12',
  endTime: '21:00',
  location: '東京都千代田区千代田1-1',
  fee: '3,000円（学生 1,500円）',
  relatedUrl: 'https://example.com/event',
  terms: '### キャンセル\n- 前日以降は50%',
  maxParticipants: 30,
  registrationDeadlineDate: '2026-09-10',
  registrationDeadlineTime: '23:59',
  isAllowedForFediverse: true,
  isAllowedForDiscord: true,
  isAllowedForTwitter: false,
  allowedFediverseServers: ['example.social'],
  isPublic: false,
  isHighlighted: false,
  allowMaybe: true,
  allowParticipationRequest: false,
  organizationId: 'org_1',
  optionGroups: [],
})

describe('eventColumnsFromForm', () => {
  it('入力をそのまま列へ写す', () => {
    expect(eventColumnsFromForm(FULL)).toEqual({
      title: 'Fediverse 交流会 2026 夏',
      description: '### 当日の流れ\n- 19:00 開場',
      hashtags: '["fediverse","オフ会"]',
      startDate: new Date('2026-09-12'),
      startTime: '19:00',
      hasStartTime: true,
      endDate: new Date('2026-09-12'),
      endTime: '21:00',
      hasEndTime: true,
      location: '東京都千代田区千代田1-1',
      maxParticipants: 30,
      isPublic: false,
      isHighlighted: false,
      registrationDeadlineDate: new Date('2026-09-10'),
      registrationDeadlineTime: '23:59',
      hasRegistrationDeadlineTime: true,
      fee: '3,000円（学生 1,500円）',
      relatedUrl: 'https://example.com/event',
      allowMaybe: true,
      allowParticipationRequest: false,
    })
  })

  it('空文字は null にする（「無し」と「空」を列で分けない）', () => {
    const columns = eventColumnsFromForm(
      eventFormSchema.parse({
        ...FULL,
        description: '',
        location: '',
        fee: '',
        relatedUrl: '',
        hashtags: [],
        maxParticipants: null,
        endDate: '',
        registrationDeadlineDate: '',
      })
    )
    expect(columns.description).toBeNull()
    expect(columns.location).toBeNull()
    expect(columns.fee).toBeNull()
    expect(columns.relatedUrl).toBeNull()
    expect(columns.hashtags).toBeNull()
    expect(columns.maxParticipants).toBeNull()
    expect(columns.endDate).toBeNull()
    expect(columns.registrationDeadlineDate).toBeNull()
  })

  /**
   * `00:00` は「日付だけを選んだ」ときに画面が送る値。時刻として保存すると
   * 0時開始のイベントになる。作成と編集でこの判定がずれると、
   * **開いて保存しただけで開始時刻が消える。**
   */
  it('00:00 は時刻の指定なしとして扱う', () => {
    const columns = eventColumnsFromForm(
      eventFormSchema.parse({
        ...FULL,
        startTime: '00:00',
        endTime: '00:00',
        registrationDeadlineTime: '00:00',
      })
    )
    expect(columns.hasStartTime).toBe(false)
    expect(columns.hasEndTime).toBe(false)
    expect(columns.hasRegistrationDeadlineTime).toBe(false)
    // 値そのものは残す（画面が入力欄へ戻すため）
    expect(columns.startTime).toBe('00:00')
  })
})

describe('EVENT_FORM_FIELDS', () => {
  it('common に分類した項目は必ず列として書かれる', () => {
    const columns = new Set(Object.keys(eventColumnsFromForm(FULL)))
    const missing = Object.entries(EVENT_FORM_FIELDS)
      .filter(([, dest]) => dest.kind === 'common')
      .map(([field]) => field)
      .filter((field) => !columns.has(field))

    expect(missing).toEqual([])
  })

  it('ルートごとに違う項目・列でない項目には理由がある', () => {
    for (const [field, dest] of Object.entries(EVENT_FORM_FIELDS)) {
      if (dest.kind === 'common') continue
      expect(dest.why, `${field} に理由がない`).not.toBe('')
    }
  })
})
