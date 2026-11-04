import { describe, expect, it } from 'vitest'

import { eventCard, stripEmoji, TITLE_MAX, truncate, type EventCardRow } from './event-card'

const ROW: EventCardRow = {
  title: '秋のオフ会',
  // 新形式: 日付文字列をそのまま Date にしたもの（UTC 0時）と、時刻の列
  startDate: new Date('2026-11-20T00:00:00Z'),
  startTime: '19:00',
  hasStartTime: true,
  endDate: new Date('2026-11-20T00:00:00Z'),
  endTime: '21:30',
  hasEndTime: true,
  location: '渋谷駅周辺',
  status: 'published',
  creator: { displayName: 'たろう' },
  organization: null,
}

describe('eventCard', () => {
  it('日付のバッジと開催日時は JST で、詳細ページと同じ文言', () => {
    const card = eventCard(ROW)
    expect(card.badge).toEqual({ month: 11, day: 20, weekday: '金' })
    expect(card.schedule).toBe('2026年11月20日(金) 19:00 〜 21:30')
  })

  it('URL の会場は「オンライン」と出す（URL そのものは載せない）', () => {
    expect(eventCard({ ...ROW, location: 'https://meet.example/abc' }).location).toBe('オンライン')
  })

  it('場所が無ければ出さない', () => {
    expect(eventCard({ ...ROW, location: '  ' }).location).toBeNull()
  })

  it('グループ名義ならグループ名を主催に出す', () => {
    expect(eventCard({ ...ROW, organization: { name: '鍋の会' } }).organizer).toBe('鍋の会')
    expect(eventCard(ROW).organizer).toBe('たろう')
  })

  it('中止したイベントには札を付ける', () => {
    expect(eventCard({ ...ROW, status: 'cancelled' }).cancelled).toBe(true)
    expect(eventCard(ROW).cancelled).toBe(false)
  })

  it(`題名は ${TITLE_MAX} 文字までに切り詰める`, () => {
    const title = eventCard({ ...ROW, title: 'あ'.repeat(100) }).title
    expect(Array.from(title)).toHaveLength(TITLE_MAX)
    expect(title.endsWith('…')).toBe(true)
  })

  it('絵文字だけの題名は「イベント」にする（空のカードにしない）', () => {
    expect(eventCard({ ...ROW, title: '🎉🍲' }).title).toBe('イベント')
  })
})

describe('stripEmoji', () => {
  it('絵文字を落とし、空白を詰める（結合された絵文字・国旗・肌の色も）', () => {
    expect(stripEmoji('🎉 秋の 🍲 オフ会 👨‍👩‍👧 🇯🇵 👍🏽')).toBe('秋の オフ会')
  })

  it('記号や全角の文字は残す', () => {
    expect(stripEmoji('第1回「鍋」★〜みんなで〜（参加費¥500）')).toBe('第1回「鍋」★〜みんなで〜（参加費¥500）')
  })
})

describe('truncate', () => {
  it('文字で数える（サロゲートペアを割らない）', () => {
    expect(truncate('𠮷'.repeat(5), 3)).toBe('𠮷𠮷…')
  })
})
