import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

/**
 * **コールバックは全部 `loginIdentity()` を通すこと。**
 *
 * username の出どころは相手のサーバーの応答。1本でも素の
 * `normalizeUsername` に戻ると、そのプラットフォームからだけ
 * `@` 入りの username が保存できる（そして `username@server` を
 * 切り直す判定を騙せる）。5本あるので、目視では気づけない。
 */
const CALLBACK_DIR = path.join(process.cwd(), 'src/app/api/v1/auth/callback')

function callbackRoutes(): string[] {
  return fs
    .readdirSync(CALLBACK_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(CALLBACK_DIR, entry.name, 'route.ts'))
    .filter((file) => fs.existsSync(file))
}

describe('OAuth コールバックの身元の検証', () => {
  it('コールバックが5本ある（増えたらこのテストの対象も増える）', () => {
    expect(callbackRoutes()).toHaveLength(5)
  })

  it.each(callbackRoutes().map((file) => [path.basename(path.dirname(file)), file]))(
    '%s は loginIdentity() を通す',
    (_name, file) => {
      expect(fs.readFileSync(file, 'utf8')).toContain('loginIdentity(')
    }
  )

  it.each(callbackRoutes().map((file) => [path.basename(path.dirname(file)), file]))(
    '%s は normalizeUsername を直接使わない',
    (_name, file) => {
      expect(fs.readFileSync(file, 'utf8')).not.toContain('normalizeUsername(')
    }
  )
})
