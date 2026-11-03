import { describe, expect, it } from 'vitest'

import { __testables } from './markdown-edits'

const { wrapSelection, prefixLines, makeTable } = __testables

describe('wrapSelection', () => {
  it('選択範囲を前後で挟み、中身を選択したままにする', () => {
    const r = wrapSelection('あいうえお', 1, 3, '**', '**', '太字')
    expect(r.text).toBe('あ**いう**えお')
    expect(r.text.slice(r.selectionStart, r.selectionEnd)).toBe('いう')
  })

  it('未選択ならプレースホルダを入れて選択する。次に打てば置き換わる', () => {
    const r = wrapSelection('', 0, 0, '**', '**', '太字')
    expect(r.text).toBe('**太字**')
    expect(r.text.slice(r.selectionStart, r.selectionEnd)).toBe('太字')
  })
})

describe('prefixLines', () => {
  it('選択した行の先頭に印を付ける', () => {
    expect(prefixLines('一行目', 0, 3, '- ', '項目').text).toBe('- 一行目')
  })

  it('複数行ならすべての行に付ける', () => {
    const r = prefixLines('あ\nい\nう', 0, 5, '- ', '項目')
    expect(r.text).toBe('- あ\n- い\n- う')
  })

  it('既に付いている行には重ねない', () => {
    expect(prefixLines('- あ', 0, 3, '- ', '項目').text).toBe('- あ')
  })

  it('行の途中にカーソルがあっても行頭から付ける', () => {
    expect(prefixLines('あいう', 2, 2, '### ', '見出し').text).toBe('### あいう')
  })

  it('空行ならプレースホルダを置く', () => {
    expect(prefixLines('', 0, 0, '- ', '項目').text).toBe('- 項目')
  })
})

describe('makeTable', () => {
  it('見出しと区切りと本文を出す', () => {
    expect(makeTable(1, 2)).toBe('\n| 見出し1 | 見出し2 |\n|---|---|\n| 　 | 　 |\n')
  })
})
