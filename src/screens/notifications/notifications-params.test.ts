import { describe, expect, it } from 'vitest'

import {
  buildNotificationsQuery,
  CATEGORIES,
  DEFAULT_FILTERS,
  kindOptions,
  readNotificationsFilters,
  type NotificationsFilters,
} from './notifications-params'

const read = (query: string) => readNotificationsFilters(new URLSearchParams(query))

function filters(overrides: Partial<NotificationsFilters> = {}): NotificationsFilters {
  return { ...DEFAULT_FILTERS, ...overrides }
}

describe('URL から絞り込みを読む', () => {
  it('何も無ければ既定', () => {
    expect(read('')).toEqual({ category: 'all', kind: 'all', page: 1 })
  })

  it('分類と種別とページを読む', () => {
    expect(read('category=organizer&kind=participation_requested&page=3')).toEqual({
      category: 'organizer',
      kind: 'participation_requested',
      page: 3,
    })
  })

  /** 手で書き換えられる前提で扱う */
  it('読めない値は既定に倒す', () => {
    expect(read('category=あやしい&kind=あやしい&page=あやしい')).toEqual(DEFAULT_FILTERS)
    expect(read('page=0').page).toBe(1)
    expect(read('page=-5').page).toBe(1)
  })

  /**
   * 「役割の、参加リクエストだけ」のような URL を手で作れてしまう。
   * サーバーは正しく空を返すが、画面には選ばれていない選択肢が残って
   * 壊れているように見える
   */
  it('分類に属さない種別は捨てる', () => {
    expect(read('category=role&kind=participation_requested').kind).toBe('all')
  })

  it('分類を選んでいなければ種別も持たない', () => {
    expect(read('kind=participation_requested').kind).toBe('all')
  })
})

describe('URL を組み立てる', () => {
  /** 全部を並べると、どれを自分で選んだのかが URL から読めなくなる */
  it('既定値は書かない', () => {
    expect(buildNotificationsQuery(filters(), {})).toBe('')
    expect(buildNotificationsQuery(filters(), { category: 'all' })).toBe('')
    expect(buildNotificationsQuery(filters(), { page: 1 })).toBe('')
  })

  it('選んだものだけを書く', () => {
    expect(buildNotificationsQuery(filters(), { category: 'organizer' })).toBe(
      '?category=organizer'
    )
    expect(
      buildNotificationsQuery(filters({ category: 'organizer' }), {
        kind: 'participation_requested',
      })
    ).toBe('?category=organizer&kind=participation_requested')
  })

  /** 3ページ目のまま条件を変えると、たいてい何も無いページに着く */
  it('絞り込みを変えたらページを1に戻す', () => {
    expect(buildNotificationsQuery(filters({ page: 3 }), { category: 'organizer' })).toBe(
      '?category=organizer'
    )
  })

  it('ページだけ変えたときは絞り込みを保つ', () => {
    expect(
      buildNotificationsQuery(filters({ category: 'organizer', page: 1 }), { page: 2 })
    ).toBe('?category=organizer&page=2')
  })

  /** 前の分類の種別が残ると、サーバーが空を返して「壊れた」ように見える */
  it('分類を変えたら種別を落とす', () => {
    expect(
      buildNotificationsQuery(
        filters({ category: 'organizer', kind: 'participation_requested' }),
        { category: 'participant' }
      )
    ).toBe('?category=participant')
  })

  it('分類と種別を同時に指定すればどちらも書く', () => {
    expect(
      buildNotificationsQuery(filters(), {
        category: 'organizer',
        kind: 'pre_event_answered',
      })
    ).toBe('?category=organizer&kind=pre_event_answered')
  })
})

describe('選択肢', () => {
  /** 375px で折り返さない上限 */
  it('粗い軸は4つまで', () => {
    expect(CATEGORIES).toHaveLength(4)
  })

  it('分類を選んでいなければ細かい軸を出さない', () => {
    expect(kindOptions('all')).toEqual([])
  })

  /** 幹事が「参加リクエスト」だけを追えるようにするのが、この機能の中心 */
  it('主催を選ぶと参加リクエストに絞れる', () => {
    expect(kindOptions('organizer').map((o) => o.value)).toEqual([
      'all',
      'participation_requested',
      'participation_registered',
      'participation_cancelled',
      'pre_event_answered',
    ])
  })

  it('組み立てた選択肢は、URL から読み戻せる', () => {
    for (const category of ['organizer', 'participant', 'role'] as const) {
      for (const option of kindOptions(category)) {
        if (option.value === 'all') continue
        const query = buildNotificationsQuery(filters(), { category, kind: option.value })
        expect(read(query.slice(1)), `${category}/${option.value}`).toEqual({
          category,
          kind: option.value,
          page: 1,
        })
      }
    }
  })
})
