import { describe, expect, it } from 'vitest'

import {
  bannerAnnouncements,
  bannerEndsAt,
  DEFAULT_BANNER_DAYS,
  isPinnedNow,
  isPublished,
  listedAnnouncements,
  parseReadIds,
  readIdsAfterDismiss,
  serializeReadIds,
  unreadAnnouncements,
  type AnnouncementVisibility,
} from './announcements'

/** 2026-06-15 12:00 JST。**オフセットまで書く**（テストは UTC で回る） */
const NOW = new Date('2026-06-15T12:00:00+09:00').getTime()

function make(overrides: Partial<AnnouncementVisibility> = {}): AnnouncementVisibility {
  return {
    id: 1,
    type: 'info',
    publishedAt: '2026-06-14T00:00:00.000Z',
    pinnedUntil: null,
    ...overrides,
  }
}

describe('公開の判定', () => {
  it('公開日時が過ぎていれば公開済み', () => {
    expect(isPublished(make({ publishedAt: '2026-06-15T02:00:00.000Z' }), NOW)).toBe(true)
  })

  it('未来の日時なら、まだ公開していない（予約）', () => {
    expect(isPublished(make({ publishedAt: '2026-06-20T00:00:00.000Z' }), NOW)).toBe(false)
  })

  it('公開日時ちょうどは公開済み', () => {
    const at = new Date(NOW).toISOString()
    expect(isPublished(make({ publishedAt: at }), NOW)).toBe(true)
  })
})

describe('バナーの掲載', () => {
  it('終了日時を決めていなければ、公開から既定の日数で降りる', () => {
    const a = make({ publishedAt: '2026-06-01T00:00:00.000Z' })
    expect(bannerEndsAt(a)).toBe(
      new Date('2026-06-01T00:00:00.000Z').getTime() + DEFAULT_BANNER_DAYS * 86_400_000
    )
    // 公開から14日経っているので、もう出ない
    expect(isPinnedNow(a, NOW)).toBe(false)
  })

  it('終了日時を決めていれば、その時刻まで出る', () => {
    const a = make({ publishedAt: '2026-06-01T00:00:00.000Z', pinnedUntil: '2026-07-01T00:00:00.000Z' })
    expect(isPinnedNow(a, NOW)).toBe(true)
  })

  it('「軽微」はバナーに出さない。掲載中の日時を入れても出ない', () => {
    const a = make({ type: 'low', pinnedUntil: '2026-07-01T00:00:00.000Z' })
    expect(isPinnedNow(a, NOW)).toBe(false)
  })

  it('公開前のものはバナーにも出ない', () => {
    const a = make({ publishedAt: '2026-06-20T00:00:00.000Z', pinnedUntil: '2026-07-01T00:00:00.000Z' })
    expect(isPinnedNow(a, NOW)).toBe(false)
  })

  it('掲載中のものだけを新しい順に返す', () => {
    const list = [
      make({ id: 1, publishedAt: '2026-06-13T00:00:00.000Z' }),
      make({ id: 2, publishedAt: '2026-06-15T00:00:00.000Z' }),
      make({ id: 3, type: 'low', publishedAt: '2026-06-14T00:00:00.000Z' }),
      make({ id: 4, publishedAt: '2026-07-01T00:00:00.000Z' }),
    ]
    expect(bannerAnnouncements(list, NOW).map((a) => a.id)).toEqual([2, 1])
  })
})

describe('一覧', () => {
  it('公開済みを新しい順に返す。「軽微」も掲載の終わったものも入る', () => {
    const list = [
      make({ id: 1, publishedAt: '2026-01-01T00:00:00.000Z' }),
      make({ id: 3, type: 'low', publishedAt: '2026-06-14T00:00:00.000Z' }),
      make({ id: 4, publishedAt: '2026-07-01T00:00:00.000Z' }),
    ]
    expect(listedAnnouncements(list, NOW).map((a) => a.id)).toEqual([3, 1])
  })

  it('同じ日時でも並びが呼ぶたびに変わらない', () => {
    const list = [make({ id: 2 }), make({ id: 1 })]
    expect(listedAnnouncements(list, NOW).map((a) => a.id)).toEqual(
      listedAnnouncements([...list].reverse(), NOW).map((a) => a.id)
    )
  })
})

describe('閉じたバナー（Cookie）', () => {
  it('閉じたものは出なくなる', () => {
    const list = [make({ id: 1 }), make({ id: 2 })]
    expect(unreadAnnouncements(list, '1').map((x) => x.id)).toEqual([2])
  })

  it('Cookie が無ければ、すべて出る', () => {
    const list = [make({ id: 1 })]
    expect(unreadAnnouncements(list, null)).toHaveLength(1)
    expect(unreadAnnouncements(list, '')).toHaveLength(1)
  })

  /*
    予約公開があるので、作った順と公開順は一致しない。id の集合で持つのは
    「あとから公開されるものが、先に閉じたものに飛び越されて出なくなる」のを
    防ぐため。**新しく公開されたものは、閉じたあとでも出る。**
  */
  it('あとから公開されたものは、既に閉じていても出る', () => {
    const closed = readIdsAfterDismiss([make({ id: 1 })])
    const later = [make({ id: 1 }), make({ id: 2 })]
    expect(unreadAnnouncements(later, closed).map((x) => x.id)).toEqual([2])
  })

  it('閉じるたびに、いま出ているものだけに入れ替わる（Cookie が太らない）', () => {
    expect(readIdsAfterDismiss([make({ id: 2 }), make({ id: 1 })])).toBe('1-2')
  })

  it('同じ id を重ねて持たない', () => {
    expect(serializeReadIds([1, 1, 2])).toBe('1-2')
  })

  it('空の値を読んでも壊れない', () => {
    expect(parseReadIds('--')).toEqual(new Set())
  })

  it('数の順に並べる（文字列の順だと 10 が 9 より前に来る）', () => {
    expect(serializeReadIds([10, 9, 2])).toBe('2-9-10')
  })

  it('数字でない値は捨てる（id が cuid だった頃の Cookie も含む）', () => {
    expect(parseReadIds('cmu711zqe0000ottzlxlf7hqb-3-x1')).toEqual(new Set([3]))
  })
})
