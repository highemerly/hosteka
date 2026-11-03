import { describe, expect, it } from 'vitest'

import { HOME_FEATURED_SIZE, HOME_FEATURED_WHERE, rankFeatured } from './home-featured'

/** テストは UTC で回る。**オフセットまで書く**（vitest.config.mts） */
const NOW = new Date('2026-09-10T12:00:00+09:00')

function event(id: string, startDate: string, participants: number) {
  return { id, startDate: new Date(startDate), _count: { participants } }
}

describe('rankFeatured', () => {
  it('開催日が近いものを先に出す', () => {
    const ranked = rankFeatured(
      [
        event('far', '2026-12-01T12:00:00+09:00', 0),
        event('near', '2026-09-12T12:00:00+09:00', 0),
      ],
      NOW
    )

    expect(ranked.map((e) => e.id)).toEqual(['near', 'far'])
  })

  it('終わったイベントも外さない。近さは過去と未来で同じに扱う', () => {
    const ranked = rankFeatured(
      [
        event('future-far', '2026-11-10T12:00:00+09:00', 0),
        event('past-near', '2026-09-08T12:00:00+09:00', 0),
      ],
      NOW
    )

    expect(ranked.map((e) => e.id)).toEqual(['past-near', 'future-far'])
  })

  it('日程が同じなら参加者の多いほうが先', () => {
    const ranked = rankFeatured(
      [
        event('quiet', '2026-09-12T12:00:00+09:00', 1),
        event('crowded', '2026-09-12T12:00:00+09:00', 50),
      ],
      NOW
    )

    expect(ranked.map((e) => e.id)).toEqual(['crowded', 'quiet'])
  })

  it('参加者数は対数で効く。人数の桁が違っても日程の近さで逆転する', () => {
    /*
      1000人と100人の差は log で 22.9 点。日程の近さの満点（30点）より
      小さいので、**100人でも今日のほうが先に出る。**
      人数を線形に効かせると、大規模なイベントが永久に上に居座る。
    */
    const ranked = rankFeatured(
      [
        event('huge-but-far', '2026-10-20T12:00:00+09:00', 1000),
        event('today-fewer', '2026-09-10T12:00:00+09:00', 100),
      ],
      NOW
    )

    expect(ranked.map((e) => e.id)).toEqual(['today-fewer', 'huge-but-far'])
  })

  it('30日より遠いものどうしは日程で差が付かず、参加者数で決まる', () => {
    const ranked = rankFeatured(
      [
        event('farther-crowded', '2026-12-01T12:00:00+09:00', 10),
        event('far-quiet', '2026-10-15T12:00:00+09:00', 0),
      ],
      NOW
    )

    expect(ranked.map((e) => e.id)).toEqual(['farther-crowded', 'far-quiet'])
  })

  it('同点なら渡された順を保つ', () => {
    const ranked = rankFeatured(
      [
        event('a', '2026-09-12T12:00:00+09:00', 3),
        event('b', '2026-09-12T12:00:00+09:00', 3),
      ],
      NOW
    )

    expect(ranked.map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('流す件数で打ち切る', () => {
    const many = Array.from({ length: HOME_FEATURED_SIZE + 10 }, (_, i) =>
      event(`e${i}`, '2026-09-12T12:00:00+09:00', i)
    )

    expect(rankFeatured(many, NOW)).toHaveLength(HOME_FEATURED_SIZE)
  })

  it('1件も無ければ空を返す', () => {
    expect(rankFeatured([], NOW)).toEqual([])
  })
})

describe('HOME_FEATURED_WHERE', () => {
  it('非公開・無効化・表示対象外・中止を母集合から外す', () => {
    expect(HOME_FEATURED_WHERE.AND).toEqual([
      { isDisabled: false },
      { isPublic: true },
      { isHighlighted: true },
      { status: { not: 'cancelled' } },
    ])
  })
})
