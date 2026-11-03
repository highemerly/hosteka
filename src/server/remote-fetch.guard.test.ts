import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * **利用者が決めたサーバーへ、素の `fetch` で繋がない。**
 *
 * 素の `fetch` はリダイレクトを追い、時間も大きさも無制限なので、
 * 偽のサーバーからクラスタの内部へ通信させられる（`remote-fetch.ts`）。
 * 1本でも残ると、そこが入口になる。画面からは見分けがつかないので、走査で固定する。
 *
 * 素の `fetch` を許すのは、宛先が**文字列で固定**されているものだけ
 * （discord.com・api.x.com・anypost.dev、自分の API）。
 */

const ROOT = join(import.meta.dirname, '..')

/** 宛先を引数で受け取るが、自分の API にしか送らないもの */
const ALLOWED_FILES = new Set(['lib/api/client.ts'])

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (entry === 'generated') continue
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path))
    else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) found.push(path)
  }
  return found
}

/** 宛先が文字列で固定されているか（変数や `${...}` から始まらない） */
function isFixedDestination(firstArg: string): boolean {
  return /^'(https:\/\/[^'$]+|\/[^']*)'/.test(firstArg) || /^`https:\/\/anypost\.dev\//.test(firstArg)
}

describe('外へ出る通信', () => {
  it('利用者が決めた宛先へは remoteFetch を通す', () => {
    const offenders: string[] = []

    for (const file of sourceFiles(ROOT)) {
      const rel = relative(ROOT, file)
      if (rel === 'server/remote-fetch.ts' || ALLOWED_FILES.has(rel)) continue

      const text = readFileSync(file, 'utf-8')
      for (const match of text.matchAll(/(?<![\w.])fetch\(\s*/g)) {
        const firstArg = text.slice(match.index + match[0].length, match.index + match[0].length + 80)
        if (!isFixedDestination(firstArg)) {
          const line = text.slice(0, match.index).split('\n').length
          offenders.push(`${rel}:${line}`)
        }
      }
    }

    expect(offenders, '宛先が変わりうる fetch があります。remoteFetch を使うこと').toEqual([])
  })
})
