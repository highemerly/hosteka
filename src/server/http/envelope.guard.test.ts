import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * `defineRoute` に載ったルートが、応答を**素の JSON で返していない**こと。
 *
 * `defineRoute` はハンドラの戻り値を `{ data }` に包むが、`Response` を
 * 返したときだけはそのまま通す（CSV・ICS・リダイレクトのため）。
 * そのため `NextResponse.json(x)` と書くと**エンベロープを素通りし、
 * 型検査もテストも通ってしまう。**
 *
 * 実際に4本が素通りしていた:
 * - `PUT /api/v1/pre-events/[id]` … 更新後の姿を Prisma の生の形で返していた
 *   （シリアライザも通らず、GET とは別の契約になっていた）
 * - `pre-events/[id]/participate` の GET / POST / DELETE
 * - `events/[id]/calendar` と `orgs/[orgId]/events/export` のエラー側は
 *   `{ error: '文字列' }` で、エンベロープの
 *   `{ error: { code, message, requestId } }` と形が違っていた
 *
 * どれも画面が応答を読んでいなかったので気づかれなかった。**読み始めた
 * ときに壊れる**（`api.*` は `data` を剥がすので `undefined` になる）。
 *
 * 直し方:
 * - 成功 … ハンドラから素の値を `return` する（201 は `created()`）
 * - エラー … `ApiError` を throw する（`defineRoute` が整える）
 * - ファイルを返す … `new NextResponse(body, { headers })` は**そのままでよい**
 */
const API_ROOT = join(process.cwd(), 'src', 'app', 'api')

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return routeFiles(full)
    return name === 'route.ts' ? [full] : []
  })
}

/** コメントを潰す。解説文に書いた `NextResponse.json()` で落ちないように */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, head: string) => head + ' '.repeat(m.length - head.length))
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

describe('統一エンベロープ', () => {
  const files = routeFiles(API_ROOT)

  it('検査対象のルートが存在する', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('defineRoute のルートが NextResponse.json で応答していない', () => {
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      if (!/\bdefineRoute\b/.test(source)) continue

      const code = stripComments(source)
      for (const match of code.matchAll(/NextResponse\.json\s*\(/g)) {
        offenders.push(`${relative(process.cwd(), file)}:${lineOf(code, match.index)}`)
      }
    }

    expect(
      offenders,
      [
        'エンベロープを素通りする応答があります。',
        '成功は素の値を return（201 は created()）、エラーは ApiError を throw。',
        'ファイル応答（CSV・ICS）は new NextResponse(...) のままでよい。',
        '',
        ...offenders,
      ].join('\n')
    ).toEqual([])
  })
})
