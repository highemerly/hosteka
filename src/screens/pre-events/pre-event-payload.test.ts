import { describe, expect, it } from 'vitest'

import { composeJst, toDateOptionDraft, toPreEventPayload } from './pre-event-payload'
import type { PreEventFormOutput } from '@/schemas/pre-event'

const base: PreEventFormOutput = {
  title: '忘年会の日程',
  description: undefined,
  hashtags: [],
  location: undefined,
  fee: undefined,
  terms: undefined,
  relatedUrl: undefined,
  dateOptions: [{ startDate: '2026-12-12', startTime: '19:00', endTime: '21:00' }],
  registrationDeadlineDate: undefined,
  registrationDeadlineTime: undefined,
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedFediverseServers: [],
  allowAutoRegistration: false,
  isPublic: true,
  isHighlighted: true,
  organizationId: undefined,
}

describe('composeJst', () => {
  it('JST として解釈する。UTC で組むと9時間ずれる', () => {
    // 19:00 JST = 10:00 UTC
    expect(composeJst('2026-12-12', '19:00')).toBe('2026-12-12T10:00:00.000Z')
  })

  it('時刻が無ければ 00:00 JST', () => {
    expect(composeJst('2026-12-12')).toBe('2026-12-11T15:00:00.000Z')
    expect(composeJst('2026-12-12', '')).toBe('2026-12-11T15:00:00.000Z')
  })
})

describe('toPreEventPayload', () => {
  it('候補日の時刻を落とさない', () => {
    const payload = toPreEventPayload(base)
    expect(payload.dateOptions[0].startDate).toBe('2026-12-12T10:00:00.000Z')
    expect(payload.dateOptions[0].endDate).toBe('2026-12-12T12:00:00.000Z')
  })

  it('終了時刻だけあるとき、開始日に付ける。同じ日の19-21時が最も多い', () => {
    const payload = toPreEventPayload({
      ...base,
      dateOptions: [{ startDate: '2026-12-12', startTime: '19:00', endTime: '21:00' }],
    })
    expect(payload.dateOptions[0].endDate?.startsWith('2026-12-12')).toBe(true)
  })

  it('終了日も終了時刻も無ければ null', () => {
    const payload = toPreEventPayload({
      ...base,
      dateOptions: [{ startDate: '2026-12-12' }],
    })
    expect(payload.dateOptions[0].endDate).toBeNull()
  })

  it('日をまたぐ候補も組める', () => {
    const payload = toPreEventPayload({
      ...base,
      dateOptions: [
        { startDate: '2026-12-12', startTime: '22:00', endDate: '2026-12-13', endTime: '02:00' },
      ],
    })
    expect(payload.dateOptions[0].endDate).toBe('2026-12-12T17:00:00.000Z')
  })

  it('終了時刻が開始より前なら翌日とみなす。22:00–02:00 を欄を増やさず書ける', () => {
    const payload = toPreEventPayload({
      ...base,
      dateOptions: [{ startDate: '2026-12-12', startTime: '22:00', endTime: '02:00' }],
    })
    // 2026-12-13 02:00 JST
    expect(payload.dateOptions[0].endDate).toBe('2026-12-12T17:00:00.000Z')
  })

  it('締切を JST の日時にまとめる', () => {
    const payload = toPreEventPayload({
      ...base,
      registrationDeadlineDate: '2026-12-01',
      registrationDeadlineTime: '23:59',
    })
    expect(payload.registrationDeadline).toBe('2026-12-01T14:59:00.000Z')
  })

  it('締切の時刻が無ければ、その日の 23:59（JST）にする', () => {
    const payload = toPreEventPayload({
      ...base,
      registrationDeadlineDate: '2026-12-01',
      registrationDeadlineTime: '',
    })
    expect(payload.registrationDeadline).toBe('2026-12-01T14:59:00.000Z')
  })

  it('締切に 00:00 を指定したら、その日の 0 時にする', () => {
    const payload = toPreEventPayload({
      ...base,
      registrationDeadlineDate: '2026-12-01',
      registrationDeadlineTime: '00:00',
    })
    expect(payload.registrationDeadline).toBe('2026-11-30T15:00:00.000Z')
  })

  it('締切が無ければ null', () => {
    expect(toPreEventPayload(base).registrationDeadline).toBeNull()
  })

  it('画面から消えた関連URLも運ぶ。送らないとPUTがnullで上書きする', () => {
    const payload = toPreEventPayload({ ...base, relatedUrl: 'https://example.com' })
    expect(payload.relatedUrl).toBe('https://example.com')
  })

  it('グループ未選択は送らない', () => {
    expect(toPreEventPayload({ ...base, organizationId: '' }).organizationId).toBeUndefined()
  })
})

describe('toDateOptionDraft', () => {
  it('JST の日付と時刻に戻す', () => {
    expect(toDateOptionDraft({ startDate: '2026-12-12T10:00:00.000Z', endDate: null })).toEqual({
      startDate: '2026-12-12',
      startTime: '19:00',
    })
  })

  it('0時の候補は「時刻なし」として戻す。列が日時1つしかない', () => {
    expect(toDateOptionDraft({ startDate: '2026-12-11T15:00:00.000Z', endDate: null })).toEqual({
      startDate: '2026-12-12',
      startTime: undefined,
    })
  })

  it('同じ日の終了は終了時刻だけにする', () => {
    expect(
      toDateOptionDraft({
        startDate: '2026-12-12T10:00:00.000Z',
        endDate: '2026-12-12T12:00:00.000Z',
      })
    ).toEqual({ startDate: '2026-12-12', startTime: '19:00', endTime: '21:00' })
  })

  it('日をまたぐ候補は終了日を持たずに戻す（翌日は組み直せる）', () => {
    expect(
      toDateOptionDraft({
        startDate: '2026-12-12T13:00:00.000Z',
        endDate: '2026-12-12T17:00:00.000Z',
      })
    ).toEqual({ startDate: '2026-12-12', startTime: '22:00', endTime: '02:00' })
  })

  /*
    時刻を決めずに 9/12–9/14 を候補にすると 9/14 の 0 時で保存される。
    `endTime: '00:00'` として戻すと開始時刻の無いまま終了時刻だけを持つ形になり、
    **開いて保存するだけで検証に弾かれる**（終了時刻だけの指定はできません）。
  */
  it('時刻を決めていない複数日の候補に、終了時刻を生やさない', () => {
    expect(
      toDateOptionDraft({
        // 9/12 00:00 JST 〜 9/14 00:00 JST
        startDate: '2026-09-11T15:00:00.000Z',
        endDate: '2026-09-13T15:00:00.000Z',
      })
    ).toEqual({ startDate: '2026-09-12', startTime: undefined, endDate: '2026-09-14' })
  })

  it('複数日にわたる候補は終了日を持ったまま運ぶ', () => {
    expect(
      toDateOptionDraft({
        startDate: '2026-12-12T01:00:00.000Z',
        endDate: '2026-12-14T06:00:00.000Z',
      })
    ).toEqual({
      startDate: '2026-12-12',
      startTime: '10:00',
      endDate: '2026-12-14',
      endTime: '15:00',
    })
  })

  /*
    **往復でずれないことが要件。** 保存 → 読み戻し → 保存で日時が変わると、
    サーバーが回答を移す先（完全一致する候補日）が消え、回答が黙って失われる。
  */
  it.each([
    ['時刻なし', '2026-12-11T15:00:00.000Z', null],
    ['同じ日の時刻あり', '2026-12-12T10:00:00.000Z', '2026-12-12T12:00:00.000Z'],
    ['日をまたぐ', '2026-12-12T13:00:00.000Z', '2026-12-12T17:00:00.000Z'],
    ['複数日', '2026-12-12T01:00:00.000Z', '2026-12-14T06:00:00.000Z'],
    ['複数日・時刻なし', '2026-12-11T15:00:00.000Z', '2026-12-13T15:00:00.000Z'],
    ['同じ日の0時に終わる', '2026-12-12T10:00:00.000Z', '2026-12-11T15:00:00.000Z'],
    ['月をまたぐ', '2026-12-31T13:00:00.000Z', '2026-12-31T17:00:00.000Z'],
  ])('往復してもずれない: %s', (_label, startDate, endDate) => {
    const draft = toDateOptionDraft({ startDate, endDate })
    const payload = toPreEventPayload({ ...base, dateOptions: [draft] })
    expect(payload.dateOptions[0]).toEqual({ startDate, endDate })
  })
})
