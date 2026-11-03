import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/*
  **生成された Prisma クライアントを、クライアントから読める場所で
  値として import しないこと。**

  Prisma 7 から生成物は node_modules ではなく `src/generated/prisma` の
  TypeScript になった。つまり**普通のソースとしてバンドルの対象になる。**
  ブラウザ側のチャンクに入ると `node:module` が解決できず、
  **本番ビルドだけが落ちる**（`next build` の Turbopack が
  "does not support external modules (request: node:module)" で止まる）。

  実際に `src/lib/errors.ts` がこれで落ちた。あのファイルは
  `app/error.tsx` と `app/global-error.tsx`（どちらもクライアント）が
  読んでおり、`Prisma` のエラークラスを値として import していた。
  テストも lint も typecheck も通るので、気づくのはビルドの時。

  `import type` は消えるので対象外。値として使いたいなら
  `src/server/` に置く（`server-only` を付ける）。
*/

/** 生成クライアントを値として import してよいファイル。 */
const ALLOWED = ['src/lib/prisma.ts']

/** 走査する場所。クライアントから読まれうるところ。 */
const SCANNED = ['src/lib', 'src/screens', 'src/components', 'src/hooks', 'src/app']

const VALUE_IMPORT = /^\s*import\s+(?!type\s)[^;]*from\s+['"](@\/generated\/prisma|\.\.?\/[^'"]*generated\/prisma)/

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, acc)
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      acc.push(full)
    }
  }
  return acc
}

describe('生成された Prisma クライアントの import', () => {
  const root = process.cwd()
  const files = SCANNED.flatMap((dir) => walk(join(root, dir))).map((f) =>
    f.replace(root + '/', ''),
  )

  it('検査対象のファイルが存在する', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('API ルート以外のクライアントから読める場所で、値として import していない', () => {
    const offenders = files
      .filter((f) => !ALLOWED.includes(f))
      // API ルートはサーバーでしか動かない（クライアントは型だけ import する）
      .filter((f) => !/^src\/app\/api\//.test(f))
      .filter((f) =>
        readFileSync(join(root, f), 'utf8')
          .split('\n')
          .some((line) => VALUE_IMPORT.test(line)),
      )

    expect(offenders).toEqual([])
  })
})
