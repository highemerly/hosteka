import { describe, expect, it } from 'vitest'

import { bestOptionId, hasTiedBest, optionScore, VOTE_MARK, VOTES } from './vote'

const counts = (available: number, maybe: number, unavailable = 0) => ({
  available,
  maybe,
  unavailable,
})

describe('optionScore', () => {
  it('○を1点、△を0.5点として数える', () => {
    expect(optionScore(counts(4, 2))).toBe(5)
  })

  it('×は数えない', () => {
    expect(optionScore(counts(1, 0, 9))).toBe(1)
  })

  it('○が同数なら△が多いほうが上。調整すれば出られる人だから', () => {
    expect(optionScore(counts(3, 2))).toBeGreaterThan(optionScore(counts(3, 0)))
  })
})

describe('bestOptionId', () => {
  it('最も集まっている候補を返す', () => {
    expect(
      bestOptionId([
        { id: 'a', counts: counts(2, 0) },
        { id: 'b', counts: counts(4, 1) },
        { id: 'c', counts: counts(3, 3) },
      ])
    ).toBe('b')
  })

  it('同点なら先に並んでいるほう。主催者が並べた順を尊重する', () => {
    expect(
      bestOptionId([
        { id: 'a', counts: counts(2, 0) },
        { id: 'b', counts: counts(2, 0) },
      ])
    ).toBe('a')
  })

  it('誰も答えていなければ null。0点の日を best と呼ばない', () => {
    expect(bestOptionId([{ id: 'a', counts: counts(0, 0, 3) }])).toBeNull()
    expect(bestOptionId([])).toBeNull()
  })
})

describe('hasTiedBest', () => {
  it('同点が並んでいれば true', () => {
    expect(
      hasTiedBest([
        { id: 'a', counts: counts(2, 0) },
        { id: 'b', counts: counts(1, 2) },
      ])
    ).toBe(true)
  })

  it('1つに決まるなら false', () => {
    expect(
      hasTiedBest([
        { id: 'a', counts: counts(3, 0) },
        { id: 'b', counts: counts(1, 0) },
      ])
    ).toBe(false)
  })

  it('誰も答えていなければ false', () => {
    expect(hasTiedBest([{ id: 'a', counts: counts(0, 0) }])).toBe(false)
  })
})

describe('記号と語', () => {
  it('3択がすべて記号と語を持つ', () => {
    for (const vote of VOTES) {
      expect(VOTE_MARK[vote]).toBeTruthy()
    }
  })
})
