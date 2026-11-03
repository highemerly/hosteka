import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * next/font の変数は `<html>` に置く。
 *
 * globals.css の `--font-sans` は :root で `var(--font-geist-sans)` を参照する。
 * 変数を `<body>` に置くと :root から見えず、`--font-sans` ごと無効になって
 * ブラウザ既定のフォントに落ちる（どのテストも落ちず、iOS Safari で見て気づいた）。
 */
describe('ルートレイアウトのフォント', () => {
  const layout = readFileSync(join(process.cwd(), 'src', 'app', 'layout.tsx'), 'utf8')
  const htmlTag = layout.match(/<html\s[^>]*>/)?.[0] ?? ''

  it('フォントの変数を <html> に付ける', () => {
    expect(htmlTag).toContain('geistSans.variable')
    expect(htmlTag).toContain('geistMono.variable')
  })
})
