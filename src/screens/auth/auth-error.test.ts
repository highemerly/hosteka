import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { AUTH_ERRORS, authErrorInfo } from './auth-error'

/**
 * **発行されるコードと、訳せるコードを一致させる。**
 *
 * OAuth のコールバックは `/auth/error?error=◯◯` へ飛ばすだけなので、
 * 訳が無くても画面は正常に見える（「不明なエラー」と出る）。実際
 * `request_expired` と `missing_session` が長らくそうなっていた。
 * コードを足した側は画面のことを考えていないので、ここで落とす。
 */
function collect(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return collect(full)
    return /\.tsx?$/.test(full) ? [full] : []
  })
}

function emittedCodes(): string[] {
  const codes = new Set<string>()
  for (const file of collect('src')) {
    if (file.includes('auth-error')) continue
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/auth\/error\?error=([a-z_]+)/g)) {
      codes.add(match[1])
    }
  }
  return [...codes].sort()
}

describe('ログインの失敗の説明', () => {
  it('サーバーが発行するコードをすべて訳せる', () => {
    const emitted = emittedCodes()
    // 走査そのものが壊れていないことも見る（0件なら通ってしまう）
    expect(emitted.length).toBeGreaterThan(5)
    expect(emitted.filter((code) => !(code in AUTH_ERRORS))).toEqual([])
  })

  it('BAN はやり直しても直らないので、ログインへ戻す案内を出さない', () => {
    expect(authErrorInfo('user_banned').retryable).toBe(false)
  })

  it('知らないコードでも説明を返す', () => {
    expect(authErrorInfo('nonexistent_code').title).toBeTruthy()
    expect(authErrorInfo(null).title).toBeTruthy()
  })
})
