import { describe, expect, it } from 'vitest'

import {
  canEditEventTerms,
  canEditPreEventTerms,
  isAllowedEventTermsChange,
  isAllowedPreEventTermsChange,
} from './event-terms'

/**
 * 参加規約を変えられる条件。
 *
 * **画面とサーバーが同じ答えを出すための唯一の定義。** ここがずれると、
 * 欄は書けるのに保存されない（あるいはその逆）という直しようのない
 * 食い違いになる。
 */
describe('canEditEventTerms', () => {
  it('誰も登録していなければ変えられる', () => {
    expect(canEditEventTerms([])).toBe(true)
  })

  it.each(['attending', 'maybe', 'participation_request'])(
    '%s が1人でもいれば変えられない',
    (status) => {
      expect(canEditEventTerms([status])).toBe(false)
    }
  )

  /*
    欠席もキャンセルも、規約に縛られる立場ではない。
    数えると「一度キャンセルが出たら永久に直せない」ことになる。
  */
  it('欠席とキャンセルだけなら変えられる', () => {
    expect(canEditEventTerms(['not_attending', 'cancelled'])).toBe(true)
  })

  it('キャンセルに混じって未定が1人いれば変えられない', () => {
    expect(canEditEventTerms(['cancelled', 'cancelled', 'maybe'])).toBe(false)
  })
})

/**
 * 変更そのものを通してよいか。**削除だけは別扱いになる。**
 */
describe('isAllowedEventTermsChange', () => {
  const locked = ['attending']

  it('値が変わっていなければ通す', () => {
    expect(isAllowedEventTermsChange(locked, { from: '規約', to: '規約' })).toBe(true)
  })

  /*
    消すのは主催者が自分の求めを取り下げること。
    これによって不利になる参加者はいない。
  */
  it('登録した人がいても削除は通す', () => {
    expect(isAllowedEventTermsChange(locked, { from: '規約', to: null })).toBe(true)
  })

  it('登録した人がいれば書き換えは通さない', () => {
    expect(isAllowedEventTermsChange(locked, { from: '規約', to: '新しい規約' })).toBe(false)
  })

  it('登録した人がいれば、後から足すのも通さない', () => {
    expect(isAllowedEventTermsChange(locked, { from: null, to: '規約' })).toBe(false)
  })

  it('誰も登録していなければ何でも通す', () => {
    expect(isAllowedEventTermsChange([], { from: null, to: '規約' })).toBe(true)
    expect(isAllowedEventTermsChange([], { from: '規約', to: '別の規約' })).toBe(true)
  })
})

/**
 * 日程調整の側。**イベントと規則は同じで、数え方だけ違う。**
 * あちらは状態で選り分けるが、こちらは回答した人の実人数を見る。
 */
describe('canEditPreEventTerms', () => {
  it('誰も回答していなければ変えられる', () => {
    expect(canEditPreEventTerms(0)).toBe(true)
  })

  it('1人でも回答していれば変えられない', () => {
    expect(canEditPreEventTerms(1)).toBe(false)
  })
})

/**
 * 日程調整の変更判定。**イベントと同じ考え方で、数え方だけ違う。**
 */
describe('isAllowedPreEventTermsChange', () => {
  it('回答した人がいても削除は通す', () => {
    expect(isAllowedPreEventTermsChange(1, { from: '規約', to: null })).toBe(true)
  })

  it('回答した人がいれば書き換えは通さない', () => {
    expect(isAllowedPreEventTermsChange(1, { from: '規約', to: '新しい規約' })).toBe(false)
  })

  it('回答した人がいれば、後から足すのも通さない', () => {
    expect(isAllowedPreEventTermsChange(1, { from: null, to: '規約' })).toBe(false)
  })

  it('値が変わっていなければ通す', () => {
    expect(isAllowedPreEventTermsChange(1, { from: '規約', to: '規約' })).toBe(true)
  })

  it('誰も回答していなければ何でも通す', () => {
    expect(isAllowedPreEventTermsChange(0, { from: null, to: '規約' })).toBe(true)
  })
})
