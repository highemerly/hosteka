import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { announcementBody } from '@/schemas/announcement'
import { announcementColumnsFromBody } from '@/server/announcements/columns'
import type { AnnouncementDto } from '@/server/serializers/announcement'

import { emptyAnnouncementForm, toAnnouncementFormValues } from './announcement-form-values'

const SCREEN_PATH = 'src/screens/admin/AdminAnnouncementsScreen.tsx'

/**
 * 編集画面を開いて保存しただけで値が消えないこと。
 *
 * サーバーは受け取った本文で全体を上書きするので、
 * `DTO → フォーム → 本文 → 列` のどこか1箇所で項目が抜けると、
 * **開いて保存し直すだけでその項目が消える。** 画面は正常に見えるので、
 * 気づくのは後日になる（`src/screens/events/edit-round-trip.test.ts` と同じ趣旨）。
 */

/** 全部の欄が埋まっているお知らせ。**空にしない** — null は往復しても null で通る */
const FULL: AnnouncementDto = {
  id: 1,
  type: 'warning',
  title: '【重要】メンテナンスのお知らせ',
  body: '## 停止する時間\n\n- 2026/7/1 02:00 〜 04:00\n\n[詳しくはこちら](/faq)',
  // 2026-06-20 19:30 JST
  publishedAt: '2026-06-20T10:30:00.000Z',
  // 2026-07-02 09:00 JST
  pinnedUntil: '2026-07-02T00:00:00.000Z',
}

/** 開いて保存しただけ、と同じ経路を通す */
function reopenAndSave(dto: AnnouncementDto) {
  return announcementColumnsFromBody(announcementBody.parse(toAnnouncementFormValues(dto)))
}

describe('編集画面を開いて保存しただけで値が消えない', () => {
  it('重要度・題名・本文がそのまま残る', () => {
    const columns = reopenAndSave(FULL)
    expect(columns.type).toBe(FULL.type)
    expect(columns.title).toBe(FULL.title)
    expect(columns.body).toBe(FULL.body)
  })

  it('公開日時が分まで変わらない', () => {
    expect(reopenAndSave(FULL).publishedAt.toISOString()).toBe(FULL.publishedAt)
  })

  /*
    **ここがずれると本番でだけ9時間動く。** フォームは JST の壁掛け時計を
    持ち、保存時に `+09:00` を付けて解釈する（CLAUDE.md「Timezone Handling」）。
    テストは UTC で回るので、写し取りが時刻帯を落としていれば必ず落ちる。
  */
  it('バナーを降ろす日時が分まで変わらない', () => {
    expect(reopenAndSave(FULL).pinnedUntil?.toISOString()).toBe(FULL.pinnedUntil)
  })

  it('バナーを降ろす日時を決めていないものは、決めていないまま', () => {
    expect(reopenAndSave({ ...FULL, pinnedUntil: null }).pinnedUntil).toBeNull()
  })

  it('本文の無いものは、本文の無いまま（詳細ページを作らない）', () => {
    expect(reopenAndSave({ ...FULL, body: null }).body).toBeNull()
  })

  it('2回開いて保存しても、1回目と同じものが出る', () => {
    const once = reopenAndSave(FULL)
    const twice = reopenAndSave({
      ...FULL,
      publishedAt: once.publishedAt.toISOString(),
      pinnedUntil: once.pinnedUntil?.toISOString() ?? null,
    })
    expect(twice).toEqual(once)
  })

  /*
    「軽微」はバナーに出ない重要度なので、掲載を終える日時を持たせない。
    画面も欄を出さない。**効かない値が行に残らないことをここで固定する。**
  */
  it('「軽微」に変えると、バナーを降ろす日時は落ちる', () => {
    expect(reopenAndSave({ ...FULL, type: 'low' }).pinnedUntil).toBeNull()
  })
})

/**
 * DTO に増えた項目を、編集画面が黙って落とさないための見張り。
 *
 * **分類は型で強制する。** `Record<keyof AnnouncementDto, …>` にしてあるので、
 * DTO に項目を足すと `npm run typecheck` が落ちる。「運ぶ」か
 * 「編集の対象外（理由付き）」かを決めるまで通らない。
 */
type Classification = { carried: true } | { carried: false; why: string }

const CLASSIFY: Record<keyof AnnouncementDto, Classification> = {
  type: { carried: true },
  title: { carried: true },
  body: { carried: true },
  publishedAt: { carried: true },
  pinnedUntil: { carried: true },

  id: { carried: false, why: 'サーバーが決める。URL になる' },
}

describe('DTO の項目がすべて分類されている', () => {
  it('見本（FULL）に、分類したすべての項目が入っている', () => {
    const missing = Object.keys(CLASSIFY).filter((key) => !(key in FULL))
    expect(missing).toEqual([])
  })

  it('編集の対象外にした項目には理由が書いてある', () => {
    const noReason = Object.entries(CLASSIFY)
      .filter(([, c]) => !c.carried && !('why' in c && c.why.trim()))
      .map(([key]) => key)
    expect(noReason).toEqual([])
  })
})

/**
 * 運んでいるのに画面に欄が無い、を見張る。
 *
 * 画面のソースに項目名が出てくるかだけを見る粗い検査。
 */
describe('フォームの項目に入力欄がある', () => {
  const source = readFileSync(join(process.cwd(), SCREEN_PATH), 'utf8')

  it.each(Object.keys(emptyAnnouncementForm()))('%s の欄が画面にある', (key) => {
    expect(source, `${key} を運んでいるが、画面に欄が無い`).toMatch(
      new RegExp(`['"\`]${key}['"\`]`)
    )
  })
})

describe('新規作成の初期値', () => {
  it('公開日時に「いま」が入っている（空欄を今すぐ公開の意味にしない）', () => {
    // 2026-06-15 21:30 JST
    const now = new Date('2026-06-15T21:30:00+09:00')
    const form = emptyAnnouncementForm(now)
    expect(form.publishedDate).toBe('2026-06-15')
    expect(form.publishedTime).toBe('21:30')
  })

  it('そのまま保存できる形になっている（題名だけ入れれば通る）', () => {
    const parsed = announcementBody.safeParse({ ...emptyAnnouncementForm(), title: 'お知らせ' })
    expect(parsed.success).toBe(true)
  })
})
