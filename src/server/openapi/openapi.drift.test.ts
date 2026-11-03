import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildOpenApi } from './build-openapi'

/**
 * 契約書（`openapi.json`）が、いまのルートと一致していること。
 *
 * **生成物をリポジトリに置く。** 差分がレビューに出るので、入力の形が
 * 変わったことに気づける（`data` の中身は contract テストのスナップショットが持つ）。
 *
 * **ドリフト検査はここでやる。** CI にステップを足す形も考えたが、
 * 生成器はルートを import して動かす必要があり、素の node では
 * `server-only` と拡張子なしの相対 import が解決できない。vitest なら
 * どちらも解決できて、contract テストが同じ経路を毎日通している。
 *
 * 作り直すときは `npm run openapi`。
 */
const OUTPUT = join(process.cwd(), 'openapi.json')

function serialize(document: unknown): string {
  return JSON.stringify(document, null, 2) + '\n'
}

describe('openapi.json', () => {
  it('すべての入力スキーマが JSON Schema に変換できる', async () => {
    const { unconvertible } = await buildOpenApi()

    // 変換できないスキーマがあると、その項目だけ契約書から消える（嘘の契約になる）
    expect(unconvertible).toEqual([])
  })

  it('コミットされた契約書が、いまのルートと一致する', async () => {
    const { document } = await buildOpenApi()
    const generated = serialize(document)

    if (process.env.UPDATE_OPENAPI) {
      writeFileSync(OUTPUT, generated)
      return
    }

    expect(existsSync(OUTPUT), 'openapi.json が無い。`npm run openapi` で作ること').toBe(true)
    expect(
      readFileSync(OUTPUT, 'utf8'),
      'openapi.json が古い。`npm run openapi` で作り直してコミットすること'
    ).toBe(generated)
  })
})
