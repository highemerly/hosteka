import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import * as cookieNames from './cookie-names'

/**
 * Cookie の名前とプライバシーポリシーの一覧を突き合わせる。
 *
 * ポリシーには**本番で発行する名前をそのまま**載せている。名前を変えても
 * 画面は何も壊れないので、ポリシーが古いままでも誰も気づかない。
 */

const policy = readFileSync(join(__dirname, '../components/legal/PrivacyDocument.tsx'), 'utf8')

// テストは本番ではないので `__Host-` が付かない。ポリシーは本番の名前で書く
const names = Object.entries(cookieNames)
  .filter(([key, value]) => key.startsWith('COOKIE_') && typeof value === 'string')
  .map(([, value]) => value as string)

describe('Cookie名', () => {
  it('命名規則 ht-<項目> に従っている', () => {
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(name).toMatch(/^ht-[a-z]+(-[a-z]+)*$/)
    }
  })

  it('すべてプライバシーポリシーに本番の名前で載っている', () => {
    for (const name of names) {
      expect(policy, `${name} がポリシーに無い`).toContain(`__Host-${name}`)
    }
  })
})
