import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * 本文の横幅を全画面で揃える。
 *
 * 画面ごとに `max-w-*` を書くと、ヘッダーと本文の左端がずれたり、
 * 画面を移った瞬間に幅が変わったりする。実際にフォームだけ
 * `max-w-3xl` で狭くなっていた。
 *
 * 幅は `SiteHeader` / `SiteFooter` と同じ値にする。変えるときは
 * ヘッダー・フッターと一緒に変えること。
 */
const PAGE_WIDTH = 'max-w-5xl'

function collect(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return collect(full)
    return full.endsWith('.tsx') ? [full] : []
  })
}

describe('本文の横幅', () => {
  it('ヘッダーとフッターが同じ幅を使っている', () => {
    for (const file of [
      'src/components/layout/SiteHeader.tsx',
      'src/components/layout/SiteFooter.tsx',
      // 読み物ページの外枠。ここが唯一の幅の決め手になるので一緒に見る
      'src/components/content/ContentPage.tsx',
    ]) {
      expect(readFileSync(file, 'utf8'), file).toContain(`w-full ${PAGE_WIDTH}`)
    }
  })

  it('画面の外枠が全部同じ幅になっている', () => {
    const offenders: string[] = []

    for (const file of collect('src/screens')) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/mx-auto w-full (max-w-[a-z0-9]+)/g)) {
        if (match[1] !== PAGE_WIDTH) offenders.push(`${file}: ${match[1]}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
