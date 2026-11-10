import { describe, expect, it } from 'vitest'

import {
  primaryDate,
  scheduleNote,
  toEventAttendable,
  toPreEventAttendable,
  type AttendableSchedule,
} from './attendable'
import type { EventListItemDto } from '@/server/serializers/event'
import type { PreEventListItemDto } from '@/server/serializers/pre-event'

const USER = { id: 'u1', username: 'a', displayName: 'A', avatar: null, server: 's', platform: 'mastodon' }

const EVENT: EventListItemDto = {
  id: 'evt_1',
  title: '交流会',
  hashtags: ['fediverse', 'hosteka'],
  startDate: '2026-09-12T10:00:00.000Z',
  endDate: '2026-09-12T13:00:00.000Z',
  hasStartTime: true,
  hasEndTime: true,
  location: '渋谷',
  fee: null,
  status: 'active',
  maxParticipants: 40,
  registrationDeadline: '2026-09-10T14:59:00.000Z',
  attendingCount: 21,
  attendees: [USER],
  creator: USER,
  organization: null,
}

const PRE_EVENT: PreEventListItemDto = {
  id: 'pre_1',
  title: '日程を決める',
  hashtags: ['ボドゲ'],
  dateOptions: [
    { id: 'd2', startDate: '2026-09-20T10:00:00.000Z', endDate: null },
    { id: 'd1', startDate: '2026-09-14T10:00:00.000Z', endDate: null },
  ],
  location: null,
  fee: null,
  registrationDeadline: null,
  respondentCount: 3,
  respondents: [USER],
  creator: USER,
  organization: null,
}

describe('toEventAttendable', () => {
  it('固定の日程として渡す', () => {
    const a = toEventAttendable(EVENT)
    expect(a.kind).toBe('event')
    expect(a.href).toBe('/events/evt_1')
    expect(a.schedule).toEqual({
      kind: 'fixed',
      start: EVENT.startDate,
      end: EVENT.endDate,
      hasStartTime: true,
      hasEndTime: true,
    })
  })

  it('定員を分母として渡す', () => {
    expect(toEventAttendable(EVENT).people).toMatchObject({ count: 21, capacity: 40, unit: '人' })
  })

  /*
    **一覧でも中止が分かるようにする。** 開いてから知ると、それまで
    参加するつもりで読んでいたことになる。
  */
  it('中止したイベントは中止として渡す', () => {
    expect(toEventAttendable({ ...EVENT, status: 'cancelled' }).cancelled).toBe(true)
    expect(toEventAttendable(EVENT).cancelled).toBe(false)
  })

  it('ハッシュタグの行き先を持つ', () => {
    expect(toEventAttendable(EVENT).tagHref?.('日本語 タグ')).toBe(
      '/events/hashtag/%E6%97%A5%E6%9C%AC%E8%AA%9E%20%E3%82%BF%E3%82%B0'
    )
  })
})

describe('toPreEventAttendable', () => {
  it('候補日として渡す', () => {
    const a = toPreEventAttendable(PRE_EVENT)
    expect(a.kind).toBe('pre-event')
    expect(a.href).toBe('/pre-events/pre_1')
    expect(a.schedule.kind).toBe('candidates')
  })

  it('定員を持たない。回答は集まるほど良いので分母を出さない', () => {
    expect(toPreEventAttendable(PRE_EVENT).people).toMatchObject({
      count: 3,
      capacity: null,
      unit: '人が回答',
    })
  })

  it('ハッシュタグは出すが、リンクにしない（タグで引く画面はイベントしか出さない）', () => {
    const item = toPreEventAttendable(PRE_EVENT)
    expect(item.tags).toEqual(['ボドゲ'])
    expect(item.tagHref).toBeUndefined()
  })
})

describe('primaryDate', () => {
  it('固定ならその日', () => {
    expect(primaryDate(toEventAttendable(EVENT).schedule)).toBe(EVENT.startDate)
  })

  it('候補が複数ならいちばん早い日。並び順に依存しない', () => {
    expect(primaryDate(toPreEventAttendable(PRE_EVENT).schedule)).toBe(
      '2026-09-14T10:00:00.000Z'
    )
  })

  it('候補が無ければ null', () => {
    expect(primaryDate({ kind: 'candidates', options: [] })).toBeNull()
  })
})

describe('scheduleNote', () => {
  it('時刻があれば範囲を出す（JST）', () => {
    expect(scheduleNote(toEventAttendable(EVENT).schedule)).toBe('19:00–22:00')
  })

  it('終了時刻が無ければ開始だけ', () => {
    const schedule: AttendableSchedule = {
      kind: 'fixed',
      start: EVENT.startDate,
      end: EVENT.endDate,
      hasStartTime: true,
      hasEndTime: false,
    }
    expect(scheduleNote(schedule)).toBe('19:00')
  })

  it('時刻を指定していなければ出さない', () => {
    const schedule: AttendableSchedule = {
      kind: 'fixed',
      start: EVENT.startDate,
      end: null,
      hasStartTime: false,
      hasEndTime: false,
    }
    expect(scheduleNote(schedule)).toBeNull()
  })

  it('候補が複数なら件数を出す', () => {
    expect(scheduleNote(toPreEventAttendable(PRE_EVENT).schedule)).toBe('候補2日')
  })

  it('候補が1つだけなら件数を出さない', () => {
    expect(
      scheduleNote({ kind: 'candidates', options: [PRE_EVENT.dateOptions[0]] })
    ).toBeNull()
  })
})
