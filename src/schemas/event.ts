import { z } from 'zod'

import { NUMBER_LIMITS, VALIDATION_LIMITS } from './limits'
import { allowedFediverseServersSchema } from './allowed-servers'
import { booleanQuery } from './common'

/** 参加ステータス。EventParticipant.status と対応する */
export const participantStatus = z.enum([
  'attending',
  'maybe',
  'not_attending',
  'cancelled',
  'participation_request',
])

/**
 * イベント一覧のクエリ。
 *
 * 組み合わせの制約（isParticipable は isParticipated=false を要求する等）は
 * これまでルート内の手書きチェックだったが、schema 側で表現する。
 */
export const listEventsQuery = z
  .object({
    isCreated: booleanQuery.optional(),
    isParticipated: booleanQuery.optional(),
    participatedStatus: participantStatus.optional(),
    isCanceled: booleanQuery.optional(),
    isParticipable: booleanQuery.optional(),
    isEnded: booleanQuery.optional(),
    ownershipMode: z.enum(['or', 'and']).default('or'),
    limit: z.coerce.number().int().min(1).max(256).optional(),
    page: z.coerce.number().int().min(1).default(1),
    startDateFrom: z.string().optional(),
    startDateTo: z.string().optional(),
    registrationDeadlineFrom: z.string().optional(),
    registrationDeadlineTo: z.string().optional(),
    sort: z.string().default('startDateASC'),
    creatorServer: z.string().trim().optional(),
  })
  .refine((v) => !(v.isParticipable === true && v.isParticipated !== false), {
    message: 'isParticipable=true のときは isParticipated=false を指定してください',
    path: ['isParticipable'],
  })
  .refine((v) => !(v.participatedStatus && v.isParticipated !== true), {
    message: 'participatedStatus は isParticipated=true のときのみ指定できます',
    path: ['participatedStatus'],
  })

/**
 * 自分のイベント一覧（`/dashboard/my-events`）のクエリ。
 *
 * **`listEventsQuery` とは別に定義する。** あちらは旧ダッシュボードと
 * 管理画面が使っている汎用の絞り込みで、組み合わせの制約が多い。
 * この画面が選ばせるのは4つだけなので、選べるものだけを型で持つ。
 */
export const myEventsQuery = z.object({
  /** 主催しているか、参加しているか。既定は両方 */
  role: z.enum(['all', 'created', 'participating']).default('all'),
  /** これからか、終わったか */
  scope: z.enum(['upcoming', 'past']).default('upcoming'),
  /**
   * 自分の回答で絞る。
   * **`role=created` では効かない**（主催は回答と無関係に自分のもの）。
   */
  status: z.union([participantStatus, z.literal('all')]).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(12),
})

export type MyEventsQuery = z.infer<typeof myEventsQuery>
export type MyEventsRole = MyEventsQuery['role']
export type MyEventsScope = MyEventsQuery['scope']
export type MyEventsStatus = MyEventsQuery['status']

export const eventIdParam = z.object({ id: z.string().trim().min(1) })

/**
 * 参加登録・回答の変更の本文。
 *
 * **状態の遷移が許されるかはここで見ない。** 「いまの状態から移れる先か」は
 * イベントの設定（未定を受けるか・リクエストを受けるか）と締切に依存するので、
 * `lib/status-transition.ts` が持つ。ここは形だけを決める。
 */
export const participateBody = z.object({
  status: participantStatus.default('attending'),
  comment: z
    .string()
    .trim()
    .max(
      VALIDATION_LIMITS.PARTICIPANT_COMMENT,
      `コメントは${VALIDATION_LIMITS.PARTICIPANT_COMMENT}文字以内で入力してください`
    )
    .nullish(),
  /** 参加規約への同意。規約があるイベントでだけ要る（判定はルート側） */
  termsAccepted: z.boolean().optional(),
  /**
   * 選んだオプション。`{ グループID: [選択肢ID, ...] }`。
   * **グループと選択肢の対応が正しいかはルートが DB で確かめる**
   * （他のイベントの選択肢IDを送られても通さないため。
   * `server/events/participant-selections.ts`）。
   */
  selectedGroupOptions: z.record(z.string(), z.array(z.string())).default({}),
  /**
   * 自由入力の回答。`{ グループID: 本文 }`。
   * 選択式のグループへ送られた分はルートが捨てる。
   */
  groupTextAnswers: z
    .record(
      z.string(),
      z
        .string()
        .trim()
        .max(
          VALIDATION_LIMITS.OPTION_TEXT_ANSWER,
          `回答は${VALIDATION_LIMITS.OPTION_TEXT_ANSWER}文字以内で入力してください`
        )
    )
    .default({}),
})

/**
 * 参加者1人を指す。**相手は `userId`。** 参加者の行のIDではない
 * （サーバーは `eventId_userId` で引く）。行のIDを送って該当行が無く
 * 500 になった経緯がある。
 */
export const eventParticipantParam = z.object({
  id: z.string().trim().min(1),
  userId: z.string().trim().min(1),
})

/**
 * 参加者の編集画面の操作（削除は DELETE）。
 * できるかどうかは `lib/status-transition.ts` の `allowedAdminActions` が決める。
 */
export const participantActionBody = z.object({
  action: z.enum(['approve', 'reject', 'cancel', 'assign_organizer', 'unassign_organizer']),
})

export type ParticipantActionBody = z.input<typeof participantActionBody>

// =============================================================================
// 作成・編集フォーム
// =============================================================================

/**
 * イベントの入力内容。
 *
 * **画面とサーバーで同じ定義を使う**（CLAUDE.md）。文字数や必須の規則を
 * 2箇所に書くと、片方だけ直したときに「入力できるのに保存できない」
 * 状態になる。参加状態の遷移で実際にそれをやった。
 *
 * 上限値は `lib/validation.ts` の VALIDATION_LIMITS をそのまま使う。
 * あちらは既存のテストが張り付いているので、値の出どころを一本にする。
 */
/** 空文字を undefined に倒す。未入力と空文字を区別しない */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}は${max}文字以内で入力してください`)
    .optional()
    .transform((v) => (v ? v : undefined))

/** `YYYY-MM-DD`。<input type="date"> の値をそのまま受ける */
const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付の形式が正しくありません')
  .refine((v) => {
    const year = Number(v.slice(0, 4))
    return year >= 2000 && year <= 2999
  }, '日付は2000年〜2999年の範囲で入力してください')

/** `HH:MM`。未入力なら「時刻を指定しない」 */
const timeInput = z
  .string()
  .regex(/^\d{2}:\d{2}$/, '時刻の形式が正しくありません')
  .optional()
  .or(z.literal('').transform(() => undefined))

/** ハッシュタグの個数の上限。旧フォームと同じ */
export const HASHTAG_MAX = 10

export const eventOptionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '選択肢の名前を入力してください')
    .max(
      VALIDATION_LIMITS.OPTION_NAME,
      `選択肢の名前は${VALIDATION_LIMITS.OPTION_NAME}文字以内で入力してください`
    ),
  /** 定員。空欄なら制限なし */
  maxParticipants: z
    .number()
    .int()
    .min(NUMBER_LIMITS.MAX_PARTICIPANTS.MIN)
    .max(NUMBER_LIMITS.MAX_PARTICIPANTS.MAX)
    .nullish(),
})

/**
 * 回答の種類。
 *
 * **真偽値を2つ並べない。** 「複数選択できる自由入力」のような、
 * 無い状態が作れてしまう。DB の `event_option_groups.responseType` と同じ値。
 *
 *   single   … 選択肢から1つ
 *   multiple … 選択肢からいくつでも
 *   text     … 選択肢を作らず、参加者が自分で書く
 */
export const optionResponseType = z.enum(['single', 'multiple', 'text'])

export type OptionResponseType = z.infer<typeof optionResponseType>

export const eventOptionGroupSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'オプションの見出しを入力してください')
      .max(
        VALIDATION_LIMITS.OPTION_GROUP_TITLE,
        `見出しは${VALIDATION_LIMITS.OPTION_GROUP_TITLE}文字以内で入力してください`
      ),
    responseType: optionResponseType,
    options: z.array(eventOptionSchema),
  })
  .superRefine((g, ctx) => {
    /*
      **自由入力は選択肢を持たない。** 主催者が作るのは見出しだけで、
      中身は参加者が書く。編集画面で選択式から切り替えただけの残りが
      送られてくることがあるので、ここで落とす（下の transform が空にする）。
    */
    if (g.responseType === 'text') return

    if (g.options.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: '選択肢を1つ以上入力してください',
        path: ['options'],
      })
    }

    /*
      **同じ見出しの中で選択肢の名前を重ねない。** 参加者一覧の絞り込みは
      「見出し＋選択肢の名前」で突き合わせるので、重なると別の選択肢の人が混ざる。
      回答する側から見ても、同じ「はい」が2つあれば選びようがない。
    */
    if (new Set(g.options.map((o) => o.name)).size !== g.options.length) {
      ctx.addIssue({ code: 'custom', message: '同じ名前の選択肢があります', path: ['options'] })
    }
  })
  /*
    自由入力に切り替えたあとも、編集画面は入力済みの選択肢を持ったままにする
    （選び直したときに書き直させないため）。**保存するのはここで落とした形。**
  */
  .transform((g) => (g.responseType === 'text' ? { ...g, options: [] } : g))

export const eventFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'イベント名は必須です')
      .max(
        VALIDATION_LIMITS.EVENT_TITLE,
        `イベント名は${VALIDATION_LIMITS.EVENT_TITLE}文字以内で入力してください`
      ),
    description: optionalText(VALIDATION_LIMITS.DESCRIPTION, '説明'),
    hashtags: z
      .array(z.string().trim().min(1))
      .max(HASHTAG_MAX, `ハッシュタグは最大${HASHTAG_MAX}個まで設定できます`),

    startDate: dateInput,
    startTime: timeInput,
    endDate: dateInput.optional().or(z.literal('').transform(() => undefined)),
    endTime: timeInput,

    location: optionalText(VALIDATION_LIMITS.LOCATION, '場所'),
    fee: optionalText(VALIDATION_LIMITS.FEE, '参加費'),
    relatedUrl: optionalText(VALIDATION_LIMITS.URL, '関連URL').refine(
      (v) => !v || /^https?:\/\/.+/.test(v),
      '関連URLは「https://」または「http://」から始まる形式で入力してください'
    ),
    terms: optionalText(VALIDATION_LIMITS.TERMS, '参加規約'),

    maxParticipants: z
      .number()
      .int()
      .min(
        NUMBER_LIMITS.MAX_PARTICIPANTS.MIN,
        `定員は${NUMBER_LIMITS.MAX_PARTICIPANTS.MIN}以上で入力してください`
      )
      .max(
        NUMBER_LIMITS.MAX_PARTICIPANTS.MAX,
        `定員は${NUMBER_LIMITS.MAX_PARTICIPANTS.MAX}以下で入力してください`
      )
      .nullish(),

    registrationDeadlineDate: dateInput
      .optional()
      .or(z.literal('').transform(() => undefined)),
    registrationDeadlineTime: timeInput,

    isAllowedForFediverse: z.boolean(),
    isAllowedForDiscord: z.boolean(),
    isAllowedForTwitter: z.boolean(),
    /** 空なら制限なし */
    allowedFediverseServers: allowedFediverseServersSchema,

    isPublic: z.boolean(),
    isHighlighted: z.boolean(),
    allowMaybe: z.boolean(),
    allowParticipationRequest: z.boolean(),

    organizationId: z.string().trim().optional(),
    optionGroups: z.array(eventOptionGroupSchema).superRefine((groups, ctx) => {
      /*
        **見出しを重ねない。** 参加者一覧のチップは見出しで「何の答えか」を
        示すので、同じ見出しが2つあると区別がつかない。
        エラーは2つ目以降に付ける。1つ目は正しく入力されている。
      */
      const seen = new Set<string>()
      groups.forEach((g, i) => {
        if (seen.has(g.title)) {
          ctx.addIssue({
            code: 'custom',
            message: '同じ見出しのオプションがあります',
            path: [i, 'title'],
          })
        }
        seen.add(g.title)
      })
    }),
  })
  .refine(
    (v) => v.isAllowedForFediverse || v.isAllowedForDiscord || v.isAllowedForTwitter,
    {
      message: '参加できるプラットフォームを1つ以上選んでください',
      path: ['isAllowedForFediverse'],
    }
  )
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: '終了日は開始日より前にできません',
    path: ['endDate'],
  })
  .refine((v) => !v.registrationDeadlineDate || v.registrationDeadlineDate <= v.startDate, {
    // 締切が開催日より後だと、終わったイベントに申し込めることになる
    message: '回答締切は開催日より後にできません',
    path: ['registrationDeadlineDate'],
  })

export type EventFormValues = z.input<typeof eventFormSchema>
export type EventFormOutput = z.output<typeof eventFormSchema>
