import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * 1つのイベント・日程調整を扱うルートは、**どれも無効化を見ている**こと。
 *
 * 管理者が無効化したものは、管理者以外には「無い」（`hideDisabledFromNonAdmins`）。
 * 詳細の GET だけを塞いでも、API を直に叩けば参加登録・回答・参加者への
 * 連絡（SNS への投稿）が通る。**1本塞ぎ忘れても画面は正常に見える**ので、
 * 走査で固定する。
 *
 * 見ていると認める書き方は3つ:
 * - `requireEventOrganizer` / `requireEventOwner` / `requirePreEventOrganizer` / `requirePreEventOwner`
 *   （主催者の操作。判定を含む）
 * - `requireVisibleEvent` / `requireVisiblePreEvent`（主催者でなくてよい操作）
 * - `hideDisabledFromNonAdmins`（行を引いたあとに自分で見る）
 */
const API_V1 = join(process.cwd(), 'src', 'app', 'api', 'v1')

/** 対象。`[id]` の下すべてと、本文で eventId を受ける連絡の2本 */
const SCOPES = [
  join(API_V1, 'events', '[id]'),
  join(API_V1, 'pre-events', '[id]'),
  join(API_V1, 'events', 'post-immediate'),
  join(API_V1, 'events', 'post-scheduled'),
]

const CHECKS = [
  'requireEventOrganizer',
  'requireEventOwner',
  'requirePreEventOrganizer',
  'requirePreEventOwner',
  'requireVisibleEvent',
  'requireVisiblePreEvent',
  'hideDisabledFromNonAdmins',
]

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return routeFiles(full)
    return name === 'route.ts' ? [full] : []
  })
}

/** コメントを潰す。解説文に書いた関数名で「見ている」ことにしない */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, head: string) => head + ' '.repeat(m.length - head.length))
}

/** `export const GET = defineRoute({ … })` を1本ずつに切る */
function handlers(source: string): { method: string; body: string }[] {
  const starts = [...source.matchAll(/export const (GET|POST|PUT|PATCH|DELETE) = defineRoute\(/g)]
  return starts.map((m, i) => ({
    method: m[1],
    body: source.slice(m.index, starts[i + 1]?.index ?? source.length),
  }))
}

describe('無効化されたイベント・日程調整', () => {
  const files = SCOPES.flatMap(routeFiles)

  it('対象のルートを見つけている（走査が空振りしていない）', () => {
    expect(files.length).toBeGreaterThanOrEqual(15)
  })

  it('どのハンドラも無効化を見ている', () => {
    const offenders: string[] = []
    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'))
      for (const { method, body } of handlers(source)) {
        if (!CHECKS.some((name) => body.includes(name))) {
          offenders.push(`${relative(process.cwd(), file)} ${method}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
