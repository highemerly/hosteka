import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import SafeMarkdown, { preprocessMarkdown } from './SafeMarkdown'

/**
 * **`rehypeRaw` で生の HTML を許している。** 要素名の許可リスト
 * （`allowedElements`）は属性を見ないので、許した要素に `style` や `class` を
 * 好きなだけ付けられた。サニタイザを通すようにしたので、ここで固定する。
 */
function html(markdown: string): string {
  const { container } = render(<SafeMarkdown>{markdown}</SafeMarkdown>)
  return container.innerHTML
}

describe('SafeMarkdown が落とすもの', () => {
  it('許していない要素は消える', () => {
    const output = html('<img src="x" onerror="alert(1)">')
    expect(output).not.toContain('<img')
    expect(output).not.toContain('onerror')
  })

  it('script は消える', () => {
    const output = html('<script>alert(1)</script>')
    expect(output).not.toContain('<script')
  })

  it('iframe は消える', () => {
    expect(html('<iframe src="https://evil.example"></iframe>')).not.toContain('<iframe')
  })

  /*
    **見た目のなりすましを止める。** 本文の中に Hosteka の警告枠をそっくり
    作ったり、画面の上に重ねたりできてしまう。
  */
  it('style 属性は落ちる', () => {
    const output = html('<p style="position:fixed;inset:0;background:white">のっとり</p>')
    expect(output).toContain('のっとり')
    expect(output).not.toContain('position:fixed')
    expect(output).not.toContain('style=')
  })

  it('許していない class は落ちる', () => {
    const output = html('<p class="fixed inset-0 bg-destructive">偽の警告</p>')
    expect(output).toContain('偽の警告')
    expect(output).not.toContain('bg-destructive')
  })

  it('イベントハンドラ属性は落ちる', () => {
    const output = html('<p onclick="alert(1)">押して</p>')
    expect(output).not.toContain('onclick')
  })

  it('id 属性は落ちる（ページの id と衝突させない）', () => {
    expect(html('<p id="main-content">x</p>')).not.toContain('id="main-content"')
  })

  it('javascript: のリンクは href にならない', () => {
    const output = html('[押して](javascript:alert(1))')
    expect(output).not.toContain('javascript:')
  })

  it('HTML コメントは残らない', () => {
    expect(html('<!-- 内緒 -->')).not.toContain('内緒')
  })
})

describe('SafeMarkdown が通すもの', () => {
  it('普通の書式は生きている', () => {
    const output = html('**太字** と *斜体* と `コード`')
    expect(output).toContain('<strong>太字</strong>')
    expect(output).toContain('<em>斜体</em>')
    expect(output).toContain('<code>コード</code>')
  })

  it('外部リンクは中間ページ経由になる', () => {
    const output = html('[リンク](https://example.com/a)')
    expect(output).toContain('/external-link?url=https%3A%2F%2Fexample.com%2Fa')
  })

  it('内部リンクはそのまま', () => {
    expect(html('[イベント](/events/1)')).toContain('href="/events/1"')
  })

  it('許した色の文字は色が付く', () => {
    expect(html('{red}あか{/red}')).toContain('text-color-red')
  })

  it('許していない色は付かない', () => {
    const output = html('{black}くろ{/black}')
    expect(output).toContain('{black}くろ{/black}')
    expect(output).not.toContain('text-color-black')
  })

  it('折りたたみは残る', () => {
    const output = html(':::details 中身\nかくれている\n:::')
    expect(output).toContain('<details')
    expect(output).toContain('<summary>中身</summary>')
    expect(output).toContain('かくれている')
  })

  /** 寄せは `align` で通し、React が `text-align` に変換して描く */
  it('テーブルは残り、寄せも効く', () => {
    const output = html('| a | b |\n| :-- | --: |\n| 1 | 2 |')
    expect(output).toContain('<table>')
    expect(output).toContain('text-align: right')
  })

  /*
    **利用者が書いた `style` は、寄せの通り道からも入らない。**
    `align` しか通さないので、`<th style="...">` は落ちる。
  */
  it('生の HTML で th に style を書いても落ちる', () => {
    const output = html('<table><tr><th style="position:fixed;inset:0">x</th></tr></table>')
    expect(output).toContain('<th>x</th>')
    expect(output).not.toContain('position:fixed')
  })

  it('タスクリストのチェックボックスは残る', () => {
    const output = html('- [x] 済み\n- [ ] これから')
    expect(output).toContain('type="checkbox"')
    expect(output).toContain('disabled')
  })

  it('閉じの無い折りたたみは、そのまま文字として出る', () => {
    const output = html(':::details 中身\nかくれていない')
    expect(output).not.toContain('<details')
    expect(output).toContain(':::details 中身')
  })

  it('折りたたみは、開きの後ろで最初に来る閉じと組になる', () => {
    const output = html(':::details 1つ目\nA\n:::\n\n:::details 2つ目\nB\n:::')
    expect(output.match(/<details/g)).toHaveLength(2)
    expect(output).toContain('<summary>2つ目</summary>')
  })

  /*
    **説明欄は誰でも書け、開いた人全員の画面で描かれる。** 前処理が入力の
    長さに対して急に遅くなると、説明を書くだけで見た人のタブを固められる。
    説明欄の上限（20000字）で、組み立てが一瞬で終わることを固定する。
  */
  it.each([
    ['空白を並べた題名', ':::details ' + ' '.repeat(19_980) + 'a'],
    ['閉じの無い開きを並べたもの', ':::details a\n'.repeat(1_500)],
  ])('%s でも固まらない', (_, input) => {
    const started = performance.now()
    preprocessMarkdown(input)
    expect(performance.now() - started).toBeLessThan(200)
  })

  it.each(['[x](//evil.example/phish)', '<a href="/\\evil.example/phish">x</a>'])(
    '%s は中間ページを挟む',
    (markdown) => {
      const output = html(markdown)
      expect(output).toContain('href="/external-link?url=')
      expect(output).not.toMatch(/href="\/[\\/]evil/)
    }
  )

  it('折りたたみの題名に HTML を書かれても、中身は文字として出る', () => {
    const output = html(':::details <img src=x onerror=alert(1)>\n本文\n:::')
    expect(output).not.toContain('<img')
    expect(output).not.toContain('onerror')
    expect(output).toContain('<summary>')
  })
})
