import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { eventFormSchema } from '@/schemas/event'
import { parseJSTDateTimeToUTC } from '@/lib/event-date-utils'
import type { EventDetailDto } from '@/server/serializers/event'

import { EMPTY_EVENT_FORM as EMPTY_FORM, toEventFormValues } from './event-form-values'

const SCREEN_PATH = 'src/screens/events/EventFormScreen.tsx'

/** 画面に欄を持たない項目。**理由を書くこと** */
const INVISIBLE: Partial<Record<keyof typeof EMPTY_FORM, string>> = {
  relatedUrl: '欄は廃止した（場所の欄がURLも受ける）。値を運ぶためだけに残している',
}

/**
 * 編集画面を開いて保存しただけで値が消えないこと。
 *
 * **この形の事故が繰り返し起きている。** サーバーは受け取った本文で
 * 全体を上書きするので、`DTO → フォーム → 本文` のどこか1箇所で
 * 項目が抜けると、**開いて保存し直すだけでその項目が消える。**
 * 画面は正常に見えるし、消えたことに気づくのは後日になる。
 *
 * 実際に起きたもの:
 *   - 日付だけを送るようになったのに、シリアライザが日付列しか見ておらず
 *     19:00 のイベントが 09:00 になった。**開いて保存するたびに定着した**
 *   - 画面から外した関連URLを運び忘れ、編集のたびに消えるところだった
 *
 * イベントのフォームは**入力欄の形のまま API へ送る**ので、往復は
 * `DTO → toEventFormValues → eventFormSchema.parse` まで。
 * 日時だけはサーバーが合成するので、同じ合成をここでも通して見る。
 */

/** 全部の欄が埋まっているイベント。**空にしない** — null は往復しても null で通る */
const FULL: EventDetailDto = {
  id: 'evt_1',
  title: 'Fediverse 交流会 2026 夏',
  description: '### 当日の流れ\n- 19:00 開場',
  hashtags: ['fediverse', 'オフ会'],
  // 2026-09-12 19:00 JST
  startDate: '2026-09-12T10:00:00.000Z',
  // 2026-09-12 21:00 JST
  endDate: '2026-09-12T12:00:00.000Z',
  hasStartTime: true,
  hasEndTime: true,
  location: '東京都千代田区千代田1-1',
  fee: '3,000円（学生 1,500円）',
  relatedUrl: 'https://example.com/event',
  terms: '### キャンセル\n- 前日以降は50%',
  status: 'published',
  isPublic: false,
  isHighlighted: false,
  maxParticipants: 30,
  // 2026-09-10 23:59 JST
  registrationDeadline: '2026-09-10T14:59:00.000Z',
  allowMaybe: true,
  allowParticipationRequest: false,
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
  participants: [],
  optionGroups: [
    {
      id: 'g1',
      title: '食事',
      responseType: 'single',
      options: [
        { id: 'o1', name: '肉', maxParticipants: 10, takenCount: 3 },
        { id: 'o2', name: '魚', maxParticipants: null, takenCount: 0 },
      ],
    },
    {
      id: 'g2',
      title: '2次会',
      responseType: 'multiple',
      options: [{ id: 'o3', name: '参加する', maxParticipants: null, takenCount: 1 }],
    },
    // 自由入力だけは選択肢を持たない。**空にしない**の例外はここ
    { id: 'g3', title: 'どこで知りましたか', responseType: 'text', options: [] },
  ],
  counts: { attending: 0, maybe: 0, participationRequest: 0 },
  viewer: {
    isAuthenticated: true,
    isOrganizer: true,
    canCancel: true,
    canChangeOrganization: true,
    participation: null,
    isEligible: true,
    ineligibleReason: null,
  },
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
}

/** 開いて保存しただけ、と同じ経路を通す */
function reopenAndSave(dto: EventDetailDto) {
  return eventFormSchema.parse(toEventFormValues(dto))
}

describe('編集画面を開いて保存しただけで値が消えない', () => {
  it('文章の項目がそのまま残る', () => {
    const body = reopenAndSave(FULL)
    expect(body.title).toBe(FULL.title)
    expect(body.description).toBe(FULL.description)
    expect(body.location).toBe(FULL.location)
    expect(body.fee).toBe(FULL.fee)
    expect(body.terms).toBe(FULL.terms)
    expect(body.hashtags).toEqual(FULL.hashtags)
  })

  /*
    画面に欄が無い項目こそ消えやすい。**運んでいることをここで固定する** —
    欄が無いので、消えても編集画面を見ているだけでは気づけない。
  */
  it('画面に欄の無い関連URLも残る', () => {
    expect(reopenAndSave(FULL).relatedUrl).toBe(FULL.relatedUrl)
  })

  /*
    **19:00 が 09:00 になった事故がここ。** 日付と時刻を別々の欄で持ち、
    サーバーで JST として合成する。合成して元の日時に戻ることを見る。
  */
  it('開催日時が分まで変わらない', () => {
    const body = reopenAndSave(FULL)
    expect(parseJSTDateTimeToUTC(body.startDate, body.startTime).toISOString()).toBe(
      FULL.startDate
    )
    expect(parseJSTDateTimeToUTC(body.endDate!, body.endTime).toISOString()).toBe(FULL.endDate)
  })

  it('回答締切が分まで変わらない', () => {
    const body = reopenAndSave(FULL)
    expect(
      parseJSTDateTimeToUTC(
        body.registrationDeadlineDate!,
        body.registrationDeadlineTime
      ).toISOString()
    ).toBe(FULL.registrationDeadline)
  })

  /*
    時刻を持たないイベントに 00:00 を付けない。日付列と時刻列が別なので、
    「持っているか」の印（hasStartTime）を見ずに読むと時刻が生える。
  */
  it('時刻を持たないイベントに時刻が生えない', () => {
    const body = reopenAndSave({
      ...FULL,
      // 2026-09-12 00:00 JST
      startDate: '2026-09-11T15:00:00.000Z',
      hasStartTime: false,
      endDate: null,
      hasEndTime: false,
    })
    expect(body.startDate).toBe('2026-09-12')
    expect(body.startTime).toBeUndefined()
    expect(body.endDate).toBeUndefined()
  })

  it('参加登録の条件が変わらない', () => {
    const body = reopenAndSave(FULL)
    expect(body.maxParticipants).toBe(FULL.maxParticipants)
    expect(body.allowMaybe).toBe(FULL.allowMaybe)
    expect(body.allowParticipationRequest).toBe(FULL.allowParticipationRequest)
    expect(body.isAllowedForFediverse).toBe(FULL.isAllowedForFediverse)
    expect(body.isAllowedForDiscord).toBe(FULL.isAllowedForDiscord)
    expect(body.isAllowedForTwitter).toBe(FULL.isAllowedForTwitter)
    expect(body.allowedFediverseServers).toEqual(FULL.allowedServers.map((s) => s.server))
  })

  it('オプション・アンケートが中身ごと残る', () => {
    expect(reopenAndSave(FULL).optionGroups).toEqual([
      {
        title: '食事',
        responseType: 'single',
        options: [
          { name: '肉', maxParticipants: 10 },
          { name: '魚', maxParticipants: null },
        ],
      },
      {
        title: '2次会',
        responseType: 'multiple',
        options: [{ name: '参加する', maxParticipants: null }],
      },
      { title: 'どこで知りましたか', responseType: 'text', options: [] },
    ])
  })

  it('見え方と主催名義が変わらない', () => {
    const body = reopenAndSave(FULL)
    expect(body.isPublic).toBe(FULL.isPublic)
    expect(body.isHighlighted).toBe(FULL.isHighlighted)
    expect(body.organizationId).toBe(FULL.organization?.id)
  })

  it('2回開いて保存しても、1回目と同じものが出る', () => {
    expect(reopenAndSave(FULL)).toEqual(reopenAndSave(FULL))
  })
})

/**
 * DTO に増えた項目を、編集画面が黙って落とさないための見張り。
 *
 * **分類は型で強制する。** `Record<keyof EventDetailDto, …>` にしてあるので、
 * DTO に項目を足すと `npm run typecheck` が落ちる。ここに「運ぶ」
 * 「編集の対象外」のどちらかを書くまで通らないので、フォームに欄を
 * 足し忘れたことに、その場で気づける。
 */
type Classification =
  /** フォームが運ぶ（編集して保存しても失われない） */
  | { carried: true }
  /** 編集の対象外。**理由を書くこと** */
  | { carried: false; why: string }

const CLASSIFY: Record<keyof EventDetailDto, Classification> = {
  title: { carried: true },
  description: { carried: true },
  hashtags: { carried: true },
  startDate: { carried: true },
  endDate: { carried: true },
  hasStartTime: { carried: true },
  hasEndTime: { carried: true },
  location: { carried: true },
  fee: { carried: true },
  relatedUrl: { carried: true },
  terms: { carried: true },
  maxParticipants: { carried: true },
  registrationDeadline: { carried: true },
  allowMaybe: { carried: true },
  allowParticipationRequest: { carried: true },
  allowedServers: { carried: true },
  isAllowedForFediverse: { carried: true },
  isAllowedForDiscord: { carried: true },
  isAllowedForTwitter: { carried: true },
  isPublic: { carried: true },
  isHighlighted: { carried: true },
  organization: { carried: true },
  optionGroups: { carried: true },

  id: { carried: false, why: '主催者が決めるものではない' },
  status: { carried: false, why: '中止は別の操作（/events/[id]/cancel）' },
  creator: { carried: false, why: '作成者は変わらない' },
  participants: { carried: false, why: '参加者は別の操作（参加者を編集）' },
  counts: { carried: false, why: '集計結果' },
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
