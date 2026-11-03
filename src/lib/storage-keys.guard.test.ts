import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import * as storageKeys from './storage-keys'

/**
 * localStorage / sessionStorage のキーとプライバシーポリシーの一覧を突き合わせる。
 * `cookie-names.guard.test.ts` と同じ考え方。
 */

const policy = readFileSync(join(__dirname, '../components/legal/PrivacyDocument.tsx'), 'utf8')

const keys = Object.values(storageKeys)

describe('ストレージのキー', () => {
  it('命名規則 ht-<項目> に従っている', () => {
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(key).toMatch(/^ht-[a-z]+(-[a-z]+)*$/)
    }
  })

  it('すべてプライバシーポリシーに載っている', () => {
    for (const key of keys) {
      // ポリシーは表（`DataTable`）で名前を並べる。等幅にするのは表のほうなので、
      // 本文に `<code>` は出てこない
      expect(policy, `${key} がポリシーに無い`).toContain(`'${key}'`)
    }
  })
})
