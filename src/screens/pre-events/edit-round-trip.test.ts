import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { preEventFormSchema } from '@/schemas/pre-event'
import type { PreEventDetailDto } from '@/server/serializers/pre-event'

import { EMPTY_PRE_EVENT_FORM as EMPTY_FORM, toPreEventFormValues } from './pre-event-form-values'

const SCREEN_PATH = 'src/screens/pre-events/PreEventFormScreen.tsx'

/** 画面に欄を持たない項目。**理由を書くこと** */
const INVISIBLE: Partial<Record<keyof typeof EMPTY_FORM, string>> = {
  relatedUrl: '欄は廃止した（場所の欄がURLも受ける）。値を運ぶためだけに残している',
}
import { toPreEventPayload } from './pre-event-payload'

/**
 * 編集画面を開いて保存しただけで値が消えないこと。
 *
 * **この形の事故が繰り返し起きている。** サーバーは受け取った本文で
 * 全体を上書きするので、`DTO → フォーム → 本文` のどこか1箇所で
 * 項目が抜けると、**開いて保存し直すだけでその項目が消える。**
 * 画面は正常に見えるし、消えたことに気づくのは後日になる。
 *
 * ここでは全項目を埋めた日程調整を1往復させ、出てきた本文が
 * 元の内容と同じことを見る。写し取り（`toPreEventFormValues`）と
 * 本文の組み立て（`toPreEventPayload`）のどちらが欠けても落ちる。
 */

/** 全部の欄が埋まっている日程調整。**空にしない** — null は往復しても null で通る */
const FULL: PreEventDetailDto = {
  id: 'pre_1',
  title: '忘年会の日程',
  description: '## 今年もやります\n- 2時間ほど',
  location: '東京都千代田区千代田1-1',
  fee: '3,000円（学生 1,500円）',
  relatedUrl: 'https://example.com/bounenkai',
  terms: '### キャンセル\n- 前日以降は50%',
  isPublic: false,
  isHighlighted: false,
  allowAutoRegistration: true,
  // 2026-12-01 23:59 JST
  registrationDeadline: '2026-12-01T14:59:00.000Z',
  allowedServers: [
    { server: 'handon.club', platform: 'mastodon' },
    { server: 'misskey.io', platform: 'misskey' },
  ],
  isAllowedForFediverse: true,
  isAllowedForDiscord: true,
  isAllowedForTwitter: true,
  creator: {
    id: 'u_host',
    username: 'host',
    displayName: '主催者',
    avatar: null,
    server: 'handon.club',
    platform: 'mastodon',
  },
  organization: { id: 'org_1', slug: 'sample', name: 'サンプル会' },
  dateOptions: [
    // 時刻なし
    {
      id: 'd1',
      startDate: '2026-12-11T15:00:00.000Z',
      endDate: null,
      displayOrder: 0,
      counts: { available: 0, maybe: 0, unavailable: 0 },
      attendees: [],
    },
    // 同じ日の時間帯（19:00–21:00 JST）
    {
      id: 'd2',
      startDate: '2026-12-12T10:00:00.000Z',
      endDate: '2026-12-12T12:00:00.000Z',
      displayOrder: 1,
      counts: { available: 1, maybe: 0, unavailable: 0 },
      attendees: [],
    },
    // 同じ日のもう1枠（13:00–15:00 JST）
    {
      id: 'd3',
      startDate: '2026-12-12T04:00:00.000Z',
      endDate: '2026-12-12T06:00:00.000Z',
      displayOrder: 2,
      counts: { available: 0, maybe: 0, unavailable: 0 },
      attendees: [],
    },
    // 日をまたぐ（22:00–翌02:00 JST）
    {
      id: 'd4',
      startDate: '2026-12-13T13:00:00.000Z',
      endDate: '2026-12-13T17:00:00.000Z',
      displayOrder: 3,
      counts: { available: 0, maybe: 0, unavailable: 0 },
      attendees: [],
    },
    // 複数日にわたる（12/19 10:00 〜 12/21 15:00 JST）
    {
      id: 'd5',
      startDate: '2026-12-19T01:00:00.000Z',
      endDate: '2026-12-21T06:00:00.000Z',
      displayOrder: 4,
      counts: { available: 0, maybe: 0, unavailable: 0 },
      attendees: [],
    },
    /*
      複数日で時刻を決めていない（12/26 〜 12/28 JST）。合宿の候補で最も多い形。
      **終了が 0 時ちょうどで保存される**ので、読み戻しで `endTime: '00:00'` を
      付けてしまうと、開始時刻の無いまま終了時刻だけを持つ候補になり、
      開いて保存するだけで検証に弾かれる。
    */
    {
      id: 'd6',
      startDate: '2026-12-25T15:00:00.000Z',
      endDate: '2026-12-27T15:00:00.000Z',
      displayOrder: 5,
      counts: { available: 0, maybe: 0, unavailable: 0 },
      attendees: [],
    },
  ],
  respondents: [],
  respondentCount: 0,
  viewer: {
    isAuthenticated: true,
    isOrganizer: true,
    canDelete: true,
    canChangeOrganization: true,
    response: null,
    isEligible: true,
    ineligibleReason: null,
  },
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
}

/** 開いて保存しただけ、と同じ経路を通す */
function reopenAndSave(dto: PreEventDetailDto) {
  return toPreEventPayload(preEventFormSchema.parse(toPreEventFormValues(dto)))
}

describe('編集画面を開いて保存しただけで値が消えない', () => {
  it('文章の項目がそのまま残る', () => {
    const payload = reopenAndSave(FULL)
    expect(payload.title).toBe(FULL.title)
    expect(payload.description).toBe(FULL.description)
    expect(payload.location).toBe(FULL.location)
    expect(payload.fee).toBe(FULL.fee)
    expect(payload.terms).toBe(FULL.terms)
  })

  /*
    画面に欄が無い項目こそ消えやすい。**運んでいることをここで固定する** —
    欄が無いので、消えても編集画面を見ているだけでは気づけない。
  */
  it('画面に欄の無い関連URLも残る', () => {
    expect(reopenAndSave(FULL).relatedUrl).toBe(FULL.relatedUrl)
  })

  it('候補日が数も日時も変わらない', () => {
    const payload = reopenAndSave(FULL)
    expect(payload.dateOptions).toEqual(
      FULL.dateOptions.map((o) => ({ startDate: o.startDate, endDate: o.endDate }))
    )
  })

  it('回答の締切が分まで変わらない', () => {
    expect(reopenAndSave(FULL).registrationDeadline).toBe(FULL.registrationDeadline)
  })

  it('回答できる範囲が変わらない', () => {
    const payload = reopenAndSave(FULL)
    expect(payload.isAllowedForFediverse).toBe(FULL.isAllowedForFediverse)
    expect(payload.isAllowedForDiscord).toBe(FULL.isAllowedForDiscord)
    expect(payload.isAllowedForTwitter).toBe(FULL.isAllowedForTwitter)
    expect(payload.allowedFediverseServers).toEqual(FULL.allowedServers.map((s) => s.server))
  })

  it('見え方と主催名義が変わらない', () => {
    const payload = reopenAndSave(FULL)
    expect(payload.isPublic).toBe(FULL.isPublic)
    expect(payload.isHighlighted).toBe(FULL.isHighlighted)
    expect(payload.allowAutoRegistration).toBe(FULL.allowAutoRegistration)
    expect(payload.organizationId).toBe(FULL.organization?.id)
  })

  it('2回開いて保存しても、1回目と同じものが出る', () => {
    // 1回目の結果で DTO を組み直し、もう一度通す。
    // 往復のたびに少しずつずれる（時刻が丸まる等）ことを捕まえる
    const once = reopenAndSave(FULL)
    const twice = reopenAndSave({
      ...FULL,
      dateOptions: FULL.dateOptions.map((o, i) => ({
        ...o,
        startDate: once.dateOptions[i].startDate,
        endDate: once.dateOptions[i].endDate,
      })),
      registrationDeadline: once.registrationDeadline,
    })
    expect(twice).toEqual(once)
  })
})

/**
 * DTO に増えた項目を、編集画面が黙って落とさないための見張り。
 *
 * **分類は型で強制する。** `Record<keyof PreEventDetailDto, …>` にして
 * あるので、DTO に項目を足すと `npm run typecheck` が落ちる。ここに
 * 「運ぶ」「編集の対象外」のどちらかを書くまで通らないので、
 * フォームに欄を足し忘れたことに、その場で気づける。
 *
 * 上の往復テストが「いま運んでいるものが消えない」ことを見て、
 * こちらが「新しく増えたものを見落とさない」ことを見る。
 */
type Classification =
  /** フォームが運ぶ（編集して保存しても失われない） */
  | { carried: true }
  /** 編集の対象外。**理由を書くこと** */
  | { carried: false; why: string }

const CLASSIFY: Record<keyof PreEventDetailDto, Classification> = {
  title: { carried: true },
  description: { carried: true },
  location: { carried: true },
  fee: { carried: true },
  terms: { carried: true },
  relatedUrl: { carried: true },
  dateOptions: { carried: true },
  registrationDeadline: { carried: true },
  isAllowedForFediverse: { carried: true },
  isAllowedForDiscord: { carried: true },
  isAllowedForTwitter: { carried: true },
  allowedServers: { carried: true },
  allowAutoRegistration: { carried: true },
  isPublic: { carried: true },
  isHighlighted: { carried: true },
  organization: { carried: true },

  id: { carried: false, why: '主催者が決めるものではない' },
  creator: { carried: false, why: '作成者は変わらない' },
  respondents: { carried: false, why: '回答者が書いたもの。フォームは触らない' },
  respondentCount: { carried: false, why: '集計結果' },
  viewer: { carried: false, why: '閲覧者ごとの状態。保存されるものではない' },
  createdAt: { carried: false, why: 'サーバーが決める' },
  updatedAt: { carried: false, why: 'サーバーが決める' },
}

describe('DTO の項目がすべて分類されている', () => {
  /*
    型では「必須の項目が FULL に入っていること」までしか強制できない。
    任意の項目が増えたときに見本が古いままにならないよう、実物と突き合わせる。
  */
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
 * **値を運ぶだけでは足りない。** 欄が無ければ主催者は変えられないし、
 * そこに何が入っているのかも分からない。意図して欄を持たないもの
 * （関連URL）は理由付きでここに書く。
 *
 * 画面のソースに項目名が出てくるかだけを見る粗い検査。**「欄が出る条件」
 * までは見られない**ので、条件付きで隠れる不具合（時刻の欄が出ない等）は
 * それぞれの規則をテストすること（`shouldShowTime` など）。
 */
describe('フォームの項目に入力欄がある', () => {
  const source = readFileSync(join(process.cwd(), SCREEN_PATH), 'utf8')

  it.each(
    (Object.keys(EMPTY_FORM) as string[]).filter((key) => !(key in INVISIBLE))
  )('%s の欄が画面にある', (key) => {
    expect(source, `${key} を運んでいるが、画面に欄が無い`).toMatch(
      new RegExp(`['"\`]${key}['"\`]`)
    )
  })

  it('欄を持たない項目には理由が書いてある', () => {
    const noReason = Object.entries(INVISIBLE)
      .filter(([, why]) => !why?.trim())
      .map(([key]) => key)
    expect(noReason).toEqual([])
  })
})
