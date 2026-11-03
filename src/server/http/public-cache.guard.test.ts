import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * 「公開キャッシュしてよい API」の宣言が**2箇所で一致していること**。
 *
 * `defineRoute` の `publicCache` は応答に `Cache-Control: public` を付けるが、
 * `next.config.ts` が `/api/*` に `private, no-store` を被せているため、
 * **除外リストに書かないと何も起きない。** 逆に、除外だけ書いてルート側の
 * 宣言を消すと、その URL は最後の網から外れたままになる。
 *
 * どちらも**ヘッダを見るまで気づけない**（画面は正常に動く）。実際、
 * 最初の実装は next.config の存在を見落としており、ルートのテストは通るのに
 * 配信されるヘッダは `private, no-store` のままだった。
 */

const API_ROOT = join(process.cwd(), 'src', 'app', 'api')

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return routeFiles(full)
    return name === 'route.ts' ? [full] : []
  })
}

/** `src/app/api/v1/home/route.ts` → `v1/home`（next.config の書き方に合わせる） */
function apiPathOf(file: string): string {
  return relative(API_ROOT, file).split(sep).slice(0, -1).join('/')
}

/** next.config.ts の除外リストを読む。値そのものを import できないため文字列で見る */
function declaredExceptions(): string[] {
  const config = readFileSync('next.config.ts', 'utf8')
  const match = config.match(/const PUBLICLY_CACHEABLE_API = \[([^\]]*)\]/)
  if (!match) throw new Error('next.config.ts に PUBLICLY_CACHEABLE_API が無い')
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

const declaring = routeFiles(API_ROOT)
  .filter((file) => /\bpublicCache:/.test(readFileSync(file, 'utf8')))
  .map(apiPathOf)
  .sort()

describe('公開キャッシュの宣言', () => {
  it('検査対象のルートが存在する', () => {
    expect(routeFiles(API_ROOT).length).toBeGreaterThan(0)
  })

  it('publicCache を宣言したルートと next.config の除外が一致している', () => {
    expect(declaring).toEqual([...declaredExceptions()].sort())
  })

  it('宣言しているルートは auth が none である', () => {
    /*
      型でも縛っているが（`DefineRouteOptions`）、ここでも見る。
      **これを破ると他人の応答が CDN から配られる。**
    */
    for (const file of routeFiles(API_ROOT)) {
      const source = readFileSync(file, 'utf8')
      if (!/\bpublicCache:/.test(source)) continue
      expect(source, apiPathOf(file)).toMatch(/auth:\s*'none'/)
    }
  })
})
