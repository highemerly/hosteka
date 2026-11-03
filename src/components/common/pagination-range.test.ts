import { describe, expect, it } from 'vitest'

import { pageRange } from './pagination-range'

describe('pageRange', () => {
  it('1ページ以下なら並べる意味がない', () => {
    expect(pageRange(1, 0)).toEqual([])
    expect(pageRange(1, 1)).toEqual([1])
  })

  it('収まるうちは全ページを出す', () => {
    expect(pageRange(3, 7, 1)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('中ほどでは両側を省略する', () => {
    expect(pageRange(10, 20, 1)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20])
  })

  it('先頭付近では左を省略せず、右へ伸ばす', () => {
    expect(pageRange(1, 20, 1)).toEqual([1, 2, 3, 4, 5, 'gap', 20])
  })

  it('末尾付近では右を省略せず、左へ伸ばす', () => {
    expect(pageRange(20, 20, 1)).toEqual([1, 'gap', 16, 17, 18, 19, 20])
  })

  it('省略記号が1ページしか隠さないなら、そのページを出す', () => {
    // 1 と 3 の間に隠れるのは 2 だけ。押せない「…」にする意味がない
    expect(pageRange(4, 8, 1)).toEqual([1, 2, 3, 4, 5, 'gap', 8])
  })

  it('端でも中でも個数が大きく変わらない。幅が動くとボタンの位置が動く', () => {
    const widths = [1, 2, 3, 10, 18, 19, 20].map((p) => pageRange(p, 20, 1).length)
    expect(new Set(widths).size).toBe(1)
  })

  it('siblings=0 なら現在地だけを挟む', () => {
    expect(pageRange(10, 20, 0)).toEqual([1, 'gap', 10, 'gap', 20])
  })

  it('省略記号の隣が連番になっていない（…の先が1つ飛びで無駄にならない）', () => {
    for (const current of [1, 5, 10, 15, 20]) {
      const items = pageRange(current, 20, 1)
      items.forEach((item, i) => {
        if (item !== 'gap') return
        const before = items[i - 1]
        const after = items[i + 1]
        if (typeof before === 'number' && typeof after === 'number') {
          expect(after - before).toBeGreaterThan(1)
        }
      })
    }
  })

  it('重複や逆順が出ない', () => {
    for (const current of [1, 2, 3, 10, 18, 19, 20]) {
      const nums = pageRange(current, 20, 1).filter((p): p is number => p !== 'gap')
      expect(new Set(nums).size).toBe(nums.length)
      expect([...nums].sort((a, b) => a - b)).toEqual(nums)
    }
  })
})
