import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { USER_PROFILE_PUBLIC_SELECT, USER_PUBLIC_SELECT } from './select-presets'

/**
 * User モデルの機密フィールド。
 * これらが Client Component へ渡ると RSC ペイロード経由でHTMLに埋め込まれ外部に露出する。
 */
const SENSITIVE_USER_FIELDS = [
  'accessToken',
  'ipAddresses',
  'lastLoginAt',
  'lastTermsAcceptedAt',
  'isAdmin',
] as const

/** 走査から外すディレクトリ。生成物は Prisma が書くもので、人は触らない */
const SKIP_DIRS = new Set(['generated'])

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, acc)
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      acc.push(full)
    }
  }
  return acc
}

describe('USER_PUBLIC_SELECT', () => {
  it('機密フィールドを含まない', () => {
    for (const field of SENSITIVE_USER_FIELDS) {
      expect(USER_PUBLIC_SELECT).not.toHaveProperty(field)
    }
  })
})

describe('USER_PROFILE_PUBLIC_SELECT', () => {
  it('機密フィールドを含まない', () => {
    for (const field of SENSITIVE_USER_FIELDS) {
      expect(USER_PROFILE_PUBLIC_SELECT).not.toHaveProperty(field)
    }
  })

  /*
    メールアドレスは公開プロフィールに載せない。ログイン中の閲覧者が
    押して初めて見えるもので、`/api/v1/users/[handle]/email` だけが返す。
    ここに足すと、未ログインのクローラーが一覧を舐めるだけで集められる。
  */
  it('email を含まない', () => {
    expect(USER_PROFILE_PUBLIC_SELECT).not.toHaveProperty('email')
  })

  it('USER_PUBLIC_SELECT の6列をすべて含む', () => {
    for (const field of Object.keys(USER_PUBLIC_SELECT)) {
      expect(USER_PROFILE_PUBLIC_SELECT).toHaveProperty(field)
    }
  })
})

describe('User を無制限に取得していないこと', () => {
  /*
    Prisma で `creator: true` / `user: true` と書くと User の全スカラーカラムが
    取れてしまう。`accessToken`（暗号化済みOAuthトークン）・`ipAddresses`・
    `isAdmin`・`lastLoginAt` まで載り、応答や RSC ペイロード経由で外部に出る。
    必要な項目は USER_PUBLIC_SELECT を使うこと（src/lib/select-presets.ts）。

    **`src/` 全体を見る。** select の実体は `src/app` だけでなく
    `src/server/queries` にもある。
  */
  const OFFENDING = /\b(creator|user)\s*:\s*true\b/

  const files = walk(join(process.cwd(), 'src'))

  it('検査対象のファイルが存在する', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  /**
   * コメント行は見ない。**この規則を説明している文そのもの**が
   * `include: { creator: true }` と書くので、素通しにすると
   * 規則を書いた文書とコードが落ちる。
   */
  const isComment = (line: string) => /^\s*(\/\/|\/?\*)/.test(line)

  it('creator: true / user: true を書いていない', () => {
    const violations: string[] = []
    for (const file of files) {
      const relative = file.replace(process.cwd() + '/', '')
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (isComment(line)) return
          if (OFFENDING.test(line)) violations.push(`${relative}:${i + 1}: ${line.trim()}`)
        })
    }

    expect(violations, 'USER_PUBLIC_SELECT を使ってください').toEqual([])
  })
})
