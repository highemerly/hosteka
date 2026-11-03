import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { eventFormSchema } from '@/schemas/event'

import { EVENT_FORM_FIELDS, eventColumnsFromForm } from './event-write'

/**
 * 作成と編集が**同じ写し取りを通る**ことを固定する。
 *
 * 以前は両方が同じ項目を手で書き写していて、`allowParticipationRequest` を
 * POST だけが読み捨てていた。**画面は正常に見えるので、気づくのは後日になる。**
 * 共通の関数を作っただけでは再発を防げない — 片方のルートが列を直接書けば、
 * その列だけまた2箇所になる。
 *
 * ここではルートの中身を読み、
 *   1. `eventColumnsFromForm` を展開していること
 *   2. 共通の列を自分で書いていないこと
 * を見る。型で縛れない（`data` は object リテラルで、余分なキーを
 * 足しても Prisma の型は通る）ので、走査で見るしかない。
 */
const ROUTES = {
  作成: 'src/app/api/v1/events/route.ts',
  編集: 'src/app/api/v1/events/[id]/route.ts',
} as const

/** 共通の写し取りが書く列 */
const COMMON_COLUMNS = Object.keys(
  eventColumnsFromForm(
    eventFormSchema.parse({
      title: 'x',
      hashtags: [],
      startDate: '2026-01-01',
      isAllowedForFediverse: true,
      isAllowedForDiscord: false,
      isAllowedForTwitter: false,
      allowedFediverseServers: [],
      isPublic: true,
      isHighlighted: true,
      allowMaybe: false,
      allowParticipationRequest: true,
      optionGroups: [],
    })
  )
)

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

/**
 * `tx.event.create` / `tx.event.update` に渡している中身だけを取り出す。
 *
 * ファイル全体を見ると、オプション（別テーブル）の `title` や
 * `maxParticipants` を拾ってしまう。あちらは同じ名前の別の列。
 */
function eventWriteBlock(text: string): string {
  const start = text.search(/tx\.event\.(create|update)\(\{/)
  expect(start, 'events への書き込みが見つからない').toBeGreaterThan(-1)

  let depth = 0
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  throw new Error('括弧が閉じていない')
}

describe('イベントの作成と編集の写し取り', () => {
  for (const [label, path] of Object.entries(ROUTES)) {
    it(`${label}は eventColumnsFromForm を展開する`, () => {
      expect(source(path)).toContain('...eventColumnsFromForm(body)')
    })

    it(`${label}は共通の列を自分で書かない`, () => {
      const block = eventWriteBlock(source(path))
      const written = COMMON_COLUMNS.filter((column) =>
        new RegExp(`^\\s+${column}:`, 'm').test(block)
      )
      expect(written).toEqual([])
    })
  }

  it('共通でない項目は、両方のルートが自分で書く', () => {
    const perRoute = Object.entries(EVENT_FORM_FIELDS)
      .filter(([, dest]) => dest.kind === 'per-route')
      .map(([field]) => field)

    for (const [label, path] of Object.entries(ROUTES)) {
      const text = source(path)
      const missing = perRoute.filter((field) => !text.includes(field))
      expect(missing, `${label}が触れていない項目`).toEqual([])
    }
  })
})
