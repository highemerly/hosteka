import { describe, expect, it } from 'vitest'

import {
  MARQUEE_SEGMENTS,
  MIN_CARDS_PER_SEGMENT,
  marqueeDuration,
  marqueeSegment,
  segmentWidth,
} from './marquee'

/** 隙間が出ない条件は `V ≤ 2W`（marquee.ts の解説） */
function coversViewport(cardCount: number, viewport: number): boolean {
  return viewport <= 2 * segmentWidth(cardCount)
}

describe('marqueeSegment', () => {
  it('1件しかなくても1本を埋める', () => {
    expect(marqueeSegment(['a'])).toHaveLength(MIN_CARDS_PER_SEGMENT)
  })

  it('2件でも1本を埋める。**ここが隙間の出ていた件数**', () => {
    expect(marqueeSegment(['a', 'b'])).toEqual(['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b'])
  })

  it('割り切れない件数は切り上げる。足りないより多いほうがよい', () => {
    // 3件 → ceil(8/3) = 3 周 = 9枚
    expect(marqueeSegment(['a', 'b', 'c'])).toHaveLength(9)
  })

  it('十分な件数ならそのまま。無駄に増やさない', () => {
    const many = Array.from({ length: 20 }, (_, i) => i)
    expect(marqueeSegment(many)).toEqual(many)
  })

  it('順番を変えない。点数の高い順という並びを崩さない', () => {
    expect(marqueeSegment(['1st', '2nd', '3rd']).slice(0, 3)).toEqual(['1st', '2nd', '3rd'])
  })

  it('空なら空。呼び出し側が節ごと出さない', () => {
    expect(marqueeSegment([])).toEqual([])
  })
})

describe('隙間が出ない条件', () => {
  /*
    実測ではなく式で確かめる。ここが崩れると「流れているのに何も無い」
    帯が周期的に現れるが、**画面は正常に描かれる**ので目で気づきにくい。
  */
  it.each([1, 2, 3, 5, 12])('%i 件でも窓が 3840px まで隙間が出ない', (count) => {
    const segment = marqueeSegment(Array.from({ length: count }, (_, i) => i))
    expect(coversViewport(segment.length, 3840)).toBe(true)
  })

  it('繰り返さないと2件では埋まらない（この対策が効いていることの裏取り）', () => {
    expect(coversViewport(2, 3840)).toBe(false)
  })

  it('つなぐ本数は3本。CSS の -33.333% と対', () => {
    expect(MARQUEE_SEGMENTS).toBe(3)
  })
})

describe('marqueeDuration', () => {
  /*
    速さは「1枚が通り過ぎる秒数」で決める。CSS に固定の秒数を書くと、
    1周の距離が枚数で変わるのに時間が同じなので、**件数が増えるほど速くなる。**
  */
  it('枚数に比例する（＝どの件数でも同じ速さで流れる）', () => {
    expect(marqueeDuration(20) / marqueeDuration(10)).toBe(2)
  })

  it.each([
    [1, 8],
    [3, 9],
    [12, 12],
  ])('%i 件のときも1枚あたりの秒数は変わらない', (count, expectedCards) => {
    const segment = marqueeSegment(Array.from({ length: count }, (_, i) => i))
    expect(segment).toHaveLength(expectedCards)
    expect(marqueeDuration(segment.length) / segment.length).toBe(4)
  })
})
