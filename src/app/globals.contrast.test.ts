import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { contrastRatio, parseOklch, type Oklch } from '@/lib/color-contrast'

/**
 * デザイントークンのコントラストを数値で固定する。
 *
 * 「立体表現よりコントラストを優先する」（docs/DESIGN_GUIDELINES.md）を
 * 実際に守れているかは目では分からない。補助テキストは白地で 4.73:1
 * あったのに、タグの淡い面の上では 4.34:1 で基準を割っていた。
 * **文字がどの面に載るかまで含めて確かめる。**
 */
const css = readFileSync('src/app/globals.css', 'utf8')

function tokensIn(selector: string): Record<string, Oklch> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`${selector} が見つかりません`)

  // 次のブロック開始の手前までを見る。入れ子のコメントに惑わされない
  const end = css.indexOf('\n}', start)
  const block = css.slice(start, end)

  const tokens: Record<string, Oklch> = {}
  for (const match of block.matchAll(/^\s*(--[a-z0-9-]+):\s*(oklch\([^)]*\));/gm)) {
    const color = parseOklch(match[2])
    if (color) tokens[match[1]] = color
  }
  return tokens
}

/** 本文・ラベルとも 4.5:1 以上（docs/DESIGN_GUIDELINES.md） */
const MIN_TEXT = 4.5

const THEMES = [
  { name: 'ライト', selector: ':root' },
  { name: 'ダーク', selector: '.dark' },
]

/** [文字, 面, 説明] */
const TEXT_ON_SURFACE: [string, string, string][] = [
  ['--foreground', '--background', '本文'],
  ['--card-foreground', '--card', 'カード本文'],
  ['--popover-foreground', '--popover', 'ポップオーバー本文'],
  ['--muted-foreground', '--background', '補助テキスト'],
  ['--muted-foreground', '--card', 'カード上の補助テキスト'],
  ['--muted-foreground', '--muted', 'タグ・バッジの上の補助テキスト'],
  ['--primary-foreground', '--primary', 'primary ボタンの文字'],
  ['--secondary-foreground', '--secondary', 'secondary 面の文字'],
  ['--accent-foreground', '--accent', 'ホバー面の文字'],
  ['--calendar-paper-foreground', '--calendar-paper', '日付'],
  ['--calendar-paper-muted', '--calendar-paper', '曜日'],
  ['--calendar-accent-foreground', '--calendar-accent', '月'],
  ['--candidate-accent-foreground', '--candidate-accent', '候補'],
  ['--primary-surface-foreground', '--primary-surface', '状態ボタンの文字'],
  ['--primary', '--background', 'リンク・強調'],
]

/**
 * 面がカードから見分けられる最低限の比。
 *
 * 以前の状態ボタン（緑）は面が 1.10 しかなく、**白いカードの上でほぼ白**
 * だった。文字のコントラストは足りていたのに「ボタンに見えない」と言われた
 * のはこれが原因で、文字だけ見ていると気づけない。
 */
const MIN_SURFACE = 1.2

describe.each(THEMES)('$name のコントラスト', ({ selector }) => {
  const tokens = tokensIn(selector)

  it.each(TEXT_ON_SURFACE)('%s on %s（%s）が 4.5:1 以上', (fg, bg) => {
    const text = tokens[fg]
    const surface = tokens[bg]
    expect(text, `${fg} が ${selector} に無い`).toBeDefined()
    expect(surface, `${bg} が ${selector} に無い`).toBeDefined()

    expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(MIN_TEXT)
  })

  it('状態ボタンの面はカードから見分けられる', () => {
    expect(
      contrastRatio(tokens['--primary-surface'], tokens['--card'])
    ).toBeGreaterThanOrEqual(MIN_SURFACE)
  })

  it('状態ボタンのホバー面は通常の面と別物に見える', () => {
    const base = tokens['--primary-surface']
    const hover = tokens['--primary-surface-hover']
    expect(hover).toBeDefined()
    expect(Math.abs(hover.l - base.l)).toBeGreaterThanOrEqual(0.03)
  })

  it('補助テキストは本文より薄い。同じなら強弱が消える', () => {
    const muted = contrastRatio(tokens['--muted-foreground'], tokens['--background'])
    const body = contrastRatio(tokens['--foreground'], tokens['--background'])
    expect(muted).toBeLessThan(body)
  })
})
