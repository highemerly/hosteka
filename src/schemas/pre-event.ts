import { z } from 'zod'
import { VALIDATION_LIMITS } from './limits'
import { allowedFediverseServersSchema } from './allowed-servers'

import { booleanQuery } from './common'

/**
 * 日程調整一覧のクエリ。
 *
 * 従来は searchParams.get() の生文字列を各所で 'true' と比較していた。
 * ここで真偽値へ正規化し、組み合わせの制約も schema 側で表現する。
 */
export const listPreEventsQuery = z
  .object({
    isCreated: booleanQuery.optional(),
    isParticipated: booleanQuery.optional(),
    isParticipable: booleanQuery.optional(),
    ownershipMode: z.enum(['or', 'and']).default('or'),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    registrationDeadlineFrom: z.string().optional(),
    registrationDeadlineTo: z.string().optional(),
    sort: z.string().default('createdAtDESC'),
    creatorServer: z.string().trim().optional(),
  })
  .refine((v) => !(v.isParticipable === true && v.isParticipated !== false), {
    message: 'isParticipable=true のときは isParticipated=false を指定してください',
    path: ['isParticipable'],
  })

/**
 * 自分の日程調整一覧（`/dashboard/my-pre-events`）のクエリ。
 *
 * **`listPreEventsQuery` とは別に定義する。** あちらは旧ダッシュボードと
 * 管理画面が使っている汎用の絞り込みで、組み合わせの制約が多い。
 * イベント側の `myEventsQuery` と**同じ形にしてある** — 2つの画面で
 * 絞り込みの語彙が違うと、行き来するたびに読み替えが要る。
 */
export const myPreEventsQuery = z.object({
  /** 主催しているか、回答したか。既定は両方 */
  role: z.enum(['all', 'created', 'participating']).default('all'),
  /**
   * これからか、終わったか。
   * **日程調整に開催日は無い**ので、未来の候補日が1つでも残っているかで決める。
   */
  scope: z.enum(['upcoming', 'past']).default('upcoming'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(12),
})

export type MyPreEventsQuery = z.infer<typeof myPreEventsQuery>
export type MyPreEventsRole = MyPreEventsQuery['role']
export type MyPreEventsScope = MyPreEventsQuery['scope']

export const preEventIdParam = z.object({ id: z.string().trim().min(1) })

/** 候補日1つ分の回答。○△× は DB の語に合わせる */
export const dateOptionResponseSchema = z.object({
  dateOptionId: z.string().trim().min(1),
  status: z.enum(['available', 'maybe', 'unavailable'], {
    error: '無効な参加状況です',
  }),
})

/**
 * 日程調整への回答の本文。
 *
 * **候補日IDがこの日程調整のものかは、ここでは見ない。** 他人の日程調整の
 * 候補日IDを送られても通さない判定は DB を引く必要があるのでルート側にある。
 */
export const respondPreEventBody = z.object({
  responses: z.array(dateOptionResponseSchema).min(1, '回答データが無効です'),
  comment: z
    .string()
    .trim()
    .max(
      VALIDATION_LIMITS.PARTICIPANT_COMMENT,
      `コメントは${VALIDATION_LIMITS.PARTICIPANT_COMMENT}文字以内で入力してください`
    )
    .nullish(),
  /** 日程が決まったら自動で参加登録するか。許可されていなければルートが断る */
  autoRegisterWhenPromoted: z.boolean().optional(),
})

// =============================================================================
// 作成・編集フォーム
// =============================================================================

/**
 * 日程調整の入力内容。
 *
 * **イベントのフォーム（`schemas/event.ts`）と同じ作りにする。**
 * 上限値は `lib/validation.ts` の VALIDATION_LIMITS をそのまま使い、
 * 規則を2箇所に書かない。
 *
 * イベントとの違いは日程だけ — あちらは開催日が1つ、こちらは候補が複数。
 */

/** `YYYY-MM-DD`。<input type="date"> の値をそのまま受ける */
const preEventDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付の形式が正しくありません')
  .refine((v) => {
    const year = Number(v.slice(0, 4))
    return year >= 2000 && year <= 2999
  }, '日付は2000年〜2999年の範囲で入力してください')

const preEventTime = z
  .string()
  .regex(/^\d{2}:\d{2}$/, '時刻の形式が正しくありません')
  .optional()
  .or(z.literal('').transform(() => undefined))

export const preEventDateOptionSchema = z
  .object({
    startDate: preEventDate,
    startTime: preEventTime,
    endDate: preEventDate.optional().or(z.literal('').transform(() => undefined)),
    endTime: preEventTime,
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: '終了日は開始日より前にできません',
    path: ['endDate'],
  })
  /*
    **終了時刻だけの候補は認めない。** 開始が無いと 0 時からとして
    保存されるので、「〜21:00」のつもりが「0:00–21:00」になる。
    終了は空にできる（「19:00から」の候補は普通にある）。
  */
  .refine((v) => !(v.endTime && !v.startTime), {
    message: '開始時刻を入れてください（終了時刻だけの指定はできません）',
    path: ['startTime'],
  })

/** 候補日の上限。多すぎると回答する側が全部に答えられない */
export const DATE_OPTION_MAX = 30

const optionalPreEventText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}は${max}文字以内で入力してください`)
    .optional()
    .transform((v) => (v ? v : undefined))

export const preEventFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'タイトルは必須です')
      .max(
        VALIDATION_LIMITS.EVENT_TITLE,
        `タイトルは${VALIDATION_LIMITS.EVENT_TITLE}文字以内で入力してください`
      ),
    description: optionalPreEventText(VALIDATION_LIMITS.DESCRIPTION, '説明'),
    location: optionalPreEventText(VALIDATION_LIMITS.LOCATION, '場所'),
    fee: optionalPreEventText(VALIDATION_LIMITS.FEE, '参加費'),
    terms: optionalPreEventText(VALIDATION_LIMITS.TERMS, '参加規約'),

    /*
      関連URLの欄は画面に無い。場所の欄が URL も受けるため
      （`components/event/location.ts`。イベント側と同じ判断）。
      **値を運ぶためだけに残してある。** 送らないと PUT が null で
      上書きするので、まだデータを移していない日程調整の URL が
      編集のたびに消える。列を片付けるときにここも消す。
    */
    relatedUrl: optionalPreEventText(VALIDATION_LIMITS.URL, '関連URL'),

    dateOptions: z
      .array(preEventDateOptionSchema)
      .min(1, '候補日を1つ以上追加してください')
      .max(DATE_OPTION_MAX, `候補日は${DATE_OPTION_MAX}日までです`),

    /** 回答の締切。イベントと違い日付と時刻を1つの列に持つ */
    registrationDeadlineDate: preEventDate
      .optional()
      .or(z.literal('').transform(() => undefined)),
    registrationDeadlineTime: preEventTime,

    isAllowedForFediverse: z.boolean(),
    isAllowedForDiscord: z.boolean(),
    isAllowedForTwitter: z.boolean(),
    allowedFediverseServers: allowedFediverseServersSchema,

    /** 日程が決まったあとの本登録を自動で行うか */
    allowAutoRegistration: z.boolean(),
    isPublic: z.boolean(),
    isHighlighted: z.boolean(),
    organizationId: z.string().trim().optional(),
  })
  .refine(
    (v) => v.isAllowedForFediverse || v.isAllowedForDiscord || v.isAllowedForTwitter,
    {
      message: '回答できるプラットフォームを1つ以上選んでください',
      path: ['isAllowedForFediverse'],
    }
  )
  /*
    **同じ日時の候補を2つ作らせない。** 同じ日に複数の枠を立てられるので、
    「この日にもう1枠」を押したまま時刻を変え忘れると起きる。保存すると
    見分けの付かない候補が並び、回答を移す先も一意に決まらなくなる。
  */
  .refine(
    (v) => {
      const keys = v.dateOptions.map((o) =>
        [o.startDate, o.startTime, o.endDate, o.endTime].map((x) => x ?? '').join('|')
      )
      return new Set(keys).size === keys.length
    },
    { message: '同じ日時の候補が重なっています', path: ['dateOptions'] }
  )
  .refine(
    (v) => {
      if (!v.registrationDeadlineDate) return true
      // 締切が最も早い候補日より後だと、日程が過ぎてから回答できることになる
      const earliest = [...v.dateOptions].sort((a, b) =>
        a.startDate.localeCompare(b.startDate)
      )[0]
      return !earliest || v.registrationDeadlineDate <= earliest.startDate
    },
    {
      message: '回答の締切は、いちばん早い候補日より後にできません',
      path: ['registrationDeadlineDate'],
    }
  )

export type PreEventFormValues = z.input<typeof preEventFormSchema>
export type PreEventFormOutput = z.output<typeof preEventFormSchema>

/**
 * 保存する形の日程調整。**フォームの形ではない。**
 *
 * 画面は `toPreEventPayload`（`screens/pre-events/pre-event-payload.ts`）で
 * 日付と時刻を JST の日時文字列1つに畳んでから送る。DB の候補日が
 * 日時2列（開始・終了）で、時刻を別に持たないため。
 *
 * **年の範囲（2000〜2999）はここで見る。** 以前は `lib/validation.ts` の
 * `validateDateRange` がルートの中で見ていたが、同じ規則を2箇所に書くと
 * 片方だけ直る。文言は当時のものをそのまま使う。
 */
const YEAR_MIN = 2000
const YEAR_MAX = 2999

function inYearRange(value: string): boolean {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  const year = parsed.getFullYear()
  return year >= YEAR_MIN && year <= YEAR_MAX
}

const savedDateTime = z.string().trim().min(1)

export const preEventPayloadDateOption = z.object({
  startDate: savedDateTime.refine(
    inYearRange,
    `開始日は${YEAR_MIN}年〜${YEAR_MAX}年の範囲で入力してください`
  ),
  endDate: savedDateTime
    .refine(inYearRange, `終了日は${YEAR_MIN}年〜${YEAR_MAX}年の範囲で入力してください`)
    .nullable(),
})

const payloadText = (max: number, label: string) =>
  z.string().trim().max(max, `${label}は${max}文字以内で入力してください`).optional()

export const preEventPayloadSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'タイトルは必須です')
    .max(
      VALIDATION_LIMITS.EVENT_TITLE,
      `タイトルは${VALIDATION_LIMITS.EVENT_TITLE}文字以内で入力してください`
    ),
  description: payloadText(VALIDATION_LIMITS.DESCRIPTION, '説明'),
  location: payloadText(VALIDATION_LIMITS.LOCATION, '場所'),
  fee: payloadText(VALIDATION_LIMITS.FEE, '参加費'),
  terms: payloadText(VALIDATION_LIMITS.TERMS, '参加規約'),
  /** 画面に欄は無い。運ぶだけ（上の `preEventFormSchema` の説明を参照） */
  relatedUrl: payloadText(VALIDATION_LIMITS.URL, '関連URL'),

  dateOptions: z
    .array(preEventPayloadDateOption)
    .min(1, '候補日時は最低1つ必要です')
    .max(DATE_OPTION_MAX, `候補日は${DATE_OPTION_MAX}日までです`),

  registrationDeadline: savedDateTime
    .refine(inYearRange, `参加締切日は${YEAR_MIN}年〜${YEAR_MAX}年の範囲で入力してください`)
    .nullable(),

  isAllowedForFediverse: z.boolean(),
  isAllowedForDiscord: z.boolean(),
  isAllowedForTwitter: z.boolean(),
  allowedFediverseServers: allowedFediverseServersSchema,

  allowAutoRegistration: z.boolean(),
  isPublic: z.boolean(),
  isHighlighted: z.boolean(),
  organizationId: z.string().trim().optional(),
})
  .refine(
    (v) => v.isAllowedForFediverse || v.isAllowedForDiscord || v.isAllowedForTwitter,
    {
      message: '少なくとも1つのプラットフォームを選択してください',
      path: ['isAllowedForFediverse'],
    }
  )
