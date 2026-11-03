import { describe, expect, it } from 'vitest'

import { contrastRatio, oklchToSrgb, parseOklch } from './color-contrast'

describe('parseOklch', () => {
  it('通常の記法を読む', () => {
    expect(parseOklch('oklch(0.5 0.13 155)')).toEqual({ l: 0.5, c: 0.13, h: 155 })
  })

  it('パーセント表記の明度を読む', () => {
    expect(parseOklch('oklch(50% 0.13 155)')).toEqual({ l: 0.5, c: 0.13, h: 155 })
  })

  it('oklch でなければ null', () => {
    expect(parseOklch('#ffffff')).toBeNull()
    expect(parseOklch('var(--foreground)')).toBeNull()
  })
})

describe('oklchToSrgb', () => {
  it('白と黒を再現する', () => {
    const white = oklchToSrgb({ l: 1, c: 0, h: 0 })
    white.forEach((v) => expect(v).toBeCloseTo(1, 2))
    const black = oklchToSrgb({ l: 0, c: 0, h: 0 })
    black.forEach((v) => expect(v).toBeCloseTo(0, 2))
  })
})

describe('contrastRatio', () => {
  const white = { l: 1, c: 0, h: 0 }
  const black = { l: 0, c: 0, h: 0 }

  it('白と黒は 21:1', () => {
    expect(contrastRatio(white, black)).toBeCloseTo(21, 1)
  })

  it('同じ色は 1:1', () => {
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5)
  })

  it('順序を問わない', () => {
    expect(contrastRatio(white, black)).toBeCloseTo(contrastRatio(black, white), 5)
  })
})
