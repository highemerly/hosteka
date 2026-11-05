import { describe, expect, it } from 'vitest'

import { OPTIONS_MAX, preEventCard, type PreEventCardRow } from './pre-event-card'

const option = (start: string, end: string | null = null) => ({
  startDate: new Date(start),
  endDate: end ? new Date(end) : null,
})

const ROW: PreEventCardRow = {
  title: '忘年会',
  location: '渋谷駅周辺',
  registrationDeadline: new Date('2026-11-30T23:59:00+09:00'),
  dateOptions: [option('2026-12-18T19:00:00+09:00', '2026-12-18T21:30:00+09:00')],
  creator: { displayName: 'たろう' },
  organization: null,
}

describe('preEventCard', () => {
  it('候補日は JST の日めくりと、画面と同じ時刻の書き方', () => {
    expect(preEventCard(ROW).options).toEqual([{ month: 12, day: 18, weekday: '金', time: '19:00–21:30' }])
  })

  /** UTC で読むと前の日になる時刻（JST の朝） */
  it('日付は JST で決める', () => {
    const [card] = preEventCard({ ...ROW, dateOptions: [option('2026-12-19T08:00:00+09:00')] }).options
    expect(card).toMatchObject({ month: 12, day: 19, weekday: '土', time: '08:00〜' })
  })

  it('時刻を決めていない候補（0時）は時刻を出さない', () => {
    expect(preEventCard({ ...ROW, dateOptions: [option('2026-12-20T00:00:00+09:00')] }).options[0].time).toBe('')
  })

  it(`候補は画面と同じ順で ${OPTIONS_MAX} 件まで並べ、残りは件数で出す`, () => {
    const days = [18, 19, 20, 25, 26, 27]
    const card = preEventCard({ ...ROW, dateOptions: days.map((d) => option(`2026-12-${d}T19:00:00+09:00`)) })
    expect(card.options.map((o) => o.day)).toEqual([18, 19, 20, 25])
    expect(card.more).toBe(2)
  })

  it('回答の締切は JST で出す。無ければ null', () => {
    expect(preEventCard(ROW).deadline).toBe('11月30日(月) 23:59')
    expect(preEventCard({ ...ROW, registrationDeadline: null }).deadline).toBeNull()
  })

  it('URL の場所は「オンライン」、空なら出さない', () => {
    expect(preEventCard({ ...ROW, location: 'https://meet.example/abc' }).location).toBe('オンライン')
    expect(preEventCard({ ...ROW, location: ' ' }).location).toBeNull()
  })

  it('グループ名義ならグループ名を主催に出す', () => {
    expect(preEventCard({ ...ROW, organization: { name: '鍋の会' } }).organizer).toBe('鍋の会')
    expect(preEventCard(ROW).organizer).toBe('たろう')
  })

  it('絵文字は落とす（フォントに字形が無い）。題名が絵文字だけなら「日程調整」', () => {
    expect(preEventCard({ ...ROW, title: '忘年会 🍻' }).title).toBe('忘年会')
    expect(preEventCard({ ...ROW, title: '🍻' }).title).toBe('日程調整')
  })
})
