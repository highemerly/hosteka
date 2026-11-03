import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * `defineRoute` に載っていないルートを固定する。
 *
 * ここに残るものは「まだ移していない」のではなく、**意図して外している。**
 * どれもリダイレクトと Cookie の設定が仕事で、統一エンベロープを返さない。
 * `defineRoute` に載せるには redirect と Cookie を返す口を足すことになり、
 * 包む意味がない（2026-09-13 の判断）。
 *
 * **外すと決めたものは、外れたままであることを固定する。** 一覧を文書にだけ
 * 書くと、新しいルートが認証チェックを持たないまま増えても誰も気づかない。
 * ここに無いルートが `defineRoute` を使っていなければ落ちる。
 *
 * 契約書（`openapi.json`）にもこの9本は載らない。
 */
const INTENTIONALLY_EXCLUDED: Record<string, string> = {
  'health/route.ts': '死活監視。エンベロープを返すと監視側の設定が変わる',

  'v1/auth/dev-login/route.ts': '開発用のログイン。Cookie を設定して終わる',
  'v1/auth/logout/route.ts': 'Cookie を消して終わる',
  'v1/auth/reset-consent/route.ts': '同意の記録を消す開発用',

  // OAuth のコールバック5本。どれも最後はリダイレクトで、応答の本文を持たない
  'v1/auth/callback/mastodon/route.ts': 'OAuth コールバック。リダイレクトで返す',
  'v1/auth/callback/misskey/route.ts': 'OAuth コールバック。リダイレクトで返す',
  'v1/auth/callback/pleroma/route.ts': 'OAuth コールバック。リダイレクトで返す',
  'v1/auth/callback/discord/route.ts': 'OAuth コールバック。リダイレクトで返す',
  'v1/auth/callback/twitter/route.ts': 'OAuth コールバック。リダイレクトで返す',
}

const API_ROOT = join(process.cwd(), 'src', 'app', 'api')

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return routeFiles(full)
    return name === 'route.ts' ? [full] : []
  })
}

describe('defineRoute に載っていないルート', () => {
  const outside = routeFiles(API_ROOT)
    .filter((file) => !readFileSync(file, 'utf8').includes('defineRoute'))
    .map((file) => relative(API_ROOT, file))
    .sort()

  it('意図して外した9本と完全に一致する', () => {
    expect(outside).toEqual(Object.keys(INTENTIONALLY_EXCLUDED).sort())
  })

  it('除外には理由が書かれている', () => {
    for (const [file, reason] of Object.entries(INTENTIONALLY_EXCLUDED)) {
      expect(reason.length, file).toBeGreaterThan(10)
    }
  })
})
