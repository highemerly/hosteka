import { hashtagsToColumn } from '@/lib/hashtags'
import type { EventFormOutput } from '@/schemas/event'

/**
 * フォームの入力を `events` の列へ写し取る。**作成と編集で同じ関数を通す。**
 *
 * 以前は `POST /api/v1/events` と `PUT /api/v1/events/[id]` が同じ項目を
 * それぞれ手で書き写していて、`allowParticipationRequest` を**POST だけが
 * 読み捨てていた**（作成時にオフにしても既定の true で保存され、編集し直す
 * までオフにできなかった）。
 *
 * これは画面の往復テスト（`screens/events/edit-round-trip.test.ts`）が
 * 防いでいる事故の**サーバー側の同型**。写し取りが2箇所にあるかぎり、
 * 片方だけ直した日に項目が黙って消える。
 *
 * ルートごとに扱いが違う項目は**ここに入れない**（`EVENT_FORM_FIELDS` が
 * 理由付きで分類する）。共通にできないものを無理に共通化すると、
 * 呼び出し側から見えない分岐ができる。
 */
export type EventColumns = {
  title: string
  description: string | null
  hashtags: string | null
  startDate: Date
  startTime: string | null
  hasStartTime: boolean
  endDate: Date | null
  endTime: string | null
  hasEndTime: boolean
  location: string | null
  maxParticipants: number | null
  isPublic: boolean
  isHighlighted: boolean
  registrationDeadlineDate: Date | null
  registrationDeadlineTime: string | null
  hasRegistrationDeadlineTime: boolean
  fee: string | null
  relatedUrl: string | null
  allowMaybe: boolean
  allowParticipationRequest: boolean
}

/**
 * 時刻が指定されたか。
 *
 * **`00:00` は「指定なし」として扱う。** 日付だけを選んだときに画面が
 * 送ってくる値で、そのまま保存すると「0時開始」のイベントになる。
 * この判定はシリアライザ（`composeDateTime`）が読む `has*Time` を決めるので、
 * 作成と編集で違うと**開いて保存しただけで開始時刻が消える**。
 */
function hasTime(time: string | undefined): boolean {
  return !!time && time !== '00:00'
}

export function eventColumnsFromForm(body: EventFormOutput): EventColumns {
  return {
    title: body.title,
    description: body.description || null,
    hashtags: hashtagsToColumn(body.hashtags),
    startDate: new Date(body.startDate),
    startTime: body.startTime || null,
    hasStartTime: hasTime(body.startTime),
    endDate: body.endDate ? new Date(body.endDate) : null,
    endTime: body.endTime || null,
    hasEndTime: hasTime(body.endTime),
    location: body.location || null,
    maxParticipants: body.maxParticipants || null,
    isPublic: body.isPublic,
    isHighlighted: body.isHighlighted,
    registrationDeadlineDate: body.registrationDeadlineDate
      ? new Date(body.registrationDeadlineDate)
      : null,
    registrationDeadlineTime: body.registrationDeadlineTime || null,
    hasRegistrationDeadlineTime: hasTime(body.registrationDeadlineTime),
    fee: body.fee || null,
    relatedUrl: body.relatedUrl || null,
    allowMaybe: body.allowMaybe,
    allowParticipationRequest: body.allowParticipationRequest,
  }
}

/** 項目の行き先。`per-route` と `not-a-column` は**理由を書くこと** */
export type FieldDestination =
  /** `eventColumnsFromForm` が同じ規則で写す */
  | { kind: 'common' }
  /** 作成と編集で扱いが違う。ルート側に残す */
  | { kind: 'per-route'; why: string }
  /** `events` の列ではない */
  | { kind: 'not-a-column'; why: string }

/**
 * `eventFormSchema` の全項目の行き先。
 *
 * **フォームに項目が増えると typecheck が落ち**、「共通で写す」か
 * 「ルートごとに違う（理由付き）」かを決めるまで通らない。決めないまま
 * 足すと、片方のルートだけが保存する項目ができる。
 */
export const EVENT_FORM_FIELDS: Record<keyof EventFormOutput, FieldDestination> = {
  title: { kind: 'common' },
  description: { kind: 'common' },
  hashtags: { kind: 'common' },
  startDate: { kind: 'common' },
  startTime: { kind: 'common' },
  endDate: { kind: 'common' },
  endTime: { kind: 'common' },
  location: { kind: 'common' },
  fee: { kind: 'common' },
  relatedUrl: { kind: 'common' },
  maxParticipants: { kind: 'common' },
  registrationDeadlineDate: { kind: 'common' },
  registrationDeadlineTime: { kind: 'common' },
  isPublic: { kind: 'common' },
  isHighlighted: { kind: 'common' },
  allowMaybe: { kind: 'common' },
  allowParticipationRequest: { kind: 'common' },

  terms: {
    kind: 'per-route',
    why: '編集は登録した人が1人もいないときだけ書ける。削除だけは登録した人がいても通す（`isAllowedEventTermsChange`）。参加登録の前に同意を求めるものなので、同意した人ができたら変えない',
  },
  isAllowedForFediverse: {
    kind: 'per-route',
    why: '編集はその面の参加者がいれば落とせない。検証してから既存値と突き合わせる',
  },
  isAllowedForDiscord: {
    kind: 'per-route',
    why: '同上',
  },
  isAllowedForTwitter: {
    kind: 'per-route',
    why: '同上',
  },
  allowedFediverseServers: {
    kind: 'per-route',
    why: 'プラットフォーム情報を付けて保存する。制限なしは作成が null、編集は [] （既存の制限を消すため、列に触らないわけにいかない）',
  },
  organizationId: {
    kind: 'per-route',
    why: '紐付ける側の管理者かを確かめる。編集は未指定なら触らない（作成は常に書く）',
  },

  optionGroups: {
    kind: 'not-a-column',
    why: '別テーブル（eventOptionGroup / eventOption）。編集は並び順で突き合わせて差分を当てる',
  },
}
