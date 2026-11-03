import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * タイムゾーンの書き忘れを機械的に見つける。
 *
 * **目視では守れない種類の規約だから、走査で守る。**
 * `date.toLocaleString('ja-JP')` は開発機（JST）では正しく見え、
 * テストも通り、本番（UTC）でだけ9時間ずれる。レビューでも
 * 「`timeZone` が無い」と気づける人はほとんどいない。
 * 実際に24箇所が同じ形で壊れていた。
 *
 * `src/lib/select-presets.test.ts` と同じ考え方（走査して違反を出す）。
 * lint の warning にしないのは、既に38件の warning が常態化していて
 * 埋もれるため。**テストとして落とす。**
 */

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path))
    else if (/\.tsx?$/.test(path)) found.push(path)
  }
  return found
}

/** `(` の位置から、対応する `)` までの引数文字列を取り出す */
function argsAt(text: string, openIndex: number): string {
  let depth = 0
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') {
      depth--
      if (depth === 0) return text.slice(openIndex + 1, i)
    }
  }
  return ''
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}

/**
 * コメントを空白で潰す（位置と行数は保つ）。
 *
 * **説明文に書いた「悪い例」で落ちないようにする。** この規約は
 * 理由を書かないと守られないのに、書くと引っかかる、では続かない。
 *
 * `//` は直前が `:` のときだけ残す（`https://` を切らないため）。
 * 厳密な字句解析ではないが、見落とす側に倒れるのは
 * 「URLと同じ行に日時整形も書いてある」ときだけで、実際には無い。
 */
function stripComments(text: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ')
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, head: string) => head + blank(m.slice(head.length)))
}

const FILES = sourceFiles('src')

/**
 * 免除するファイル。
 *
 * `jst.ts` は唯一 `Intl` に時刻帯を渡す場所。この走査自体は、
 * 探している形をコード（正規表現）として持つので自分に引っかかる。
 * **この2つ以外を増やさないこと** — 例外が2つ目を呼ぶ。
 */
const ALLOWED = ['src/lib/jst.ts', 'src/lib/jst.guard.test.ts']

describe('タイムゾーンの書き忘れ', () => {
  /*
    引数のある `toLocale*` は、必ず時刻帯を伴うこと。

    引数が無いもの（`count.toLocaleString()` の桁区切りなど）は対象外。
    あれは日時ではないし、実行環境で変わってよい。
  */
  it('toLocale* に timeZone がある', () => {
    const violations: string[] = []

    for (const file of FILES) {
      if (ALLOWED.includes(file)) continue
      const text = stripComments(readFileSync(file, 'utf8'))

      for (const match of text.matchAll(
        /\.(toLocaleString|toLocaleDateString|toLocaleTimeString)\s*\(/g
      )) {
        const args = argsAt(text, match.index + match[0].length - 1)
        if (args.trim() === '') continue
        if (/timeZone/.test(args)) continue
        violations.push(`${file}:${lineOf(text, match.index)}  ${match[1]}`)
      }
    }

    expect(
      violations,
      [
        'timeZone を渡していない日時の整形があります。',
        '@/lib/jst の formatJstDate / formatJstDateTime / formatJstTime を使ってください。',
        '', ...violations,
      ].join('\n')
    ).toEqual([])
  })

  /*
    `new Date(なにか.toLocaleString(...))` を書かないこと。

    JST の Date を作るために文字列へ落として読み直す書き方。
    戻り値は瞬間としては嘘になり（保存・比較で9時間ずれる）、
    しかも `new Date('9/12/2026, 7:00:00 PM')` の解釈は実装依存
    （ECMA-262）。部品が欲しいなら `jstParts` を使う。
  */
  it('new Date(…toLocaleString(…)) を書いていない', () => {
    const violations: string[] = []

    for (const file of FILES) {
      if (ALLOWED.includes(file)) continue
      const text = stripComments(readFileSync(file, 'utf8'))

      for (const match of text.matchAll(/new Date\(\s*[^)]*\.toLocale(String|DateString)\s*\(/g)) {
        violations.push(`${file}:${lineOf(text, match.index)}`)
      }
    }

    expect(
      violations,
      [
        '文字列に落として読み直す形で JST の Date を作っています。',
        '@/lib/jst の jstParts（部品）か toJstWallClock（既存互換）を使ってください。',
        '', ...violations,
      ].join('\n')
    ).toEqual([])
  })
})
