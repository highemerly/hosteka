import { toJstDateInput, toJstTimeInput } from '@/lib/jst'
import { isUserAllowed } from '@/lib/participation-utils'

/**
 * 日程調整をイベントにするときの規則。**画面とサーバーが同じものを読む。**
 *
 * 作成画面は日時・規約・参加できる人・主催の名義を日程調整のものに固定して見せ、
 * サーバーは送られてきた本文がそれと食い違っていれば断る。片方だけに書くと、
 * 画面で選べるのに送ると失敗する状態か、画面では固定に見えるのに API からは
 * 変えられる状態ができる。
 *
 * isomorphic（`prisma` も `server-only` も import しない）。
 */

/** イベントの日時の欄（`<input type="date">` / `<input type="time">` の値）。無いものは空文字 */
export type EventDateFields = {
  startDate: string
  startTime: string
  endDate: string
  endTime: string
}

/**
 * 候補日を、イベントの日時の欄にする。
 *
 * **時刻を持たない候補は 00:00 で保存されている**（候補日の列は日時1つ）。
 * イベントは日付と時刻を別に持つので、00:00 は「時刻なし」に戻す
 * （`toDateOptionDraft` と同じ読み方）。
 *
 * イベントは終了日があるときだけ終了時刻を持つ。同じ日に終わる候補も
 * 終了日を書く（書かないと終了時刻が捨てられる）。
 */
export function eventDateFieldsFromOption(option: {
  startDate: Date | string
  endDate: Date | string | null
}): EventDateFields {
  const time = (value: Date | string) => {
    const t = toJstTimeInput(value)
    return t === '00:00' ? '' : t
  }
  return {
    startDate: toJstDateInput(option.startDate),
    startTime: time(option.startDate),
    endDate: option.endDate ? toJstDateInput(option.endDate) : '',
    endTime: option.endDate ? time(option.endDate) : '',
  }
}

/**
 * 日程調整から写して、イベントにするときに変えられない項目。
 *
 * - **規約**: 回答した人は日程調整の規約に同意している。自動登録はその同意を
 *   イベントへ引き継ぐので、違う規約にはできない。無い規約を足すこともできない
 * - **参加できる人**: 回答した人はその条件で答えている。広げたければ作ったあとに編集する
 * - **主催の名義**: 日程調整を出した名義のまま
 */
export type PromotionSource = {
  terms: string | null
  organizationId: string | null
  isAllowedForFediverse: boolean
  isAllowedForDiscord: boolean
  isAllowedForTwitter: boolean
  /** サーバー名。空なら制限なし */
  allowedServers: string[]
}

/** 作成画面が日程調整の値で固定する欄 */
export const PROMOTION_FIXED_FIELDS = [
  'startDate',
  'startTime',
  'endDate',
  'endTime',
  'terms',
  'organizationId',
  'isAllowedForFediverse',
  'isAllowedForDiscord',
  'isAllowedForTwitter',
  'allowedFediverseServers',
] as const

export type PromotionFixedField = (typeof PROMOTION_FIXED_FIELDS)[number]

/** 突き合わせる本文。フォームの出力（空欄は undefined）も入力（空欄は ''）も受ける */
export type PromotionForm = {
  startDate: string
  startTime?: string
  endDate?: string
  endTime?: string
  terms?: string
  organizationId?: string
  isAllowedForFediverse: boolean
  isAllowedForDiscord: boolean
  isAllowedForTwitter: boolean
  allowedFediverseServers: string[]
}

/** 固定する欄に入れる値。作成画面の初期値になる */
export function promotionFixedValues(
  source: PromotionSource,
  option: { startDate: Date | string; endDate: Date | string | null }
): Required<PromotionForm> {
  return {
    ...eventDateFieldsFromOption(option),
    terms: source.terms ?? '',
    organizationId: source.organizationId ?? '',
    isAllowedForFediverse: source.isAllowedForFediverse,
    isAllowedForDiscord: source.isAllowedForDiscord,
    isAllowedForTwitter: source.isAllowedForTwitter,
    allowedFediverseServers: source.allowedServers,
  }
}

const sameServers = (a: string[], b: string[]) => {
  const left = [...new Set(a)].sort()
  const right = [...new Set(b)].sort()
  return left.length === right.length && left.every((v, i) => v === right[i])
}

/**
 * 本文が日程調整（と選んだ候補日）と食い違う欄。食い違いが無ければ空配列。
 *
 * 空欄の表し方（`''` と `undefined`）、規約の前後の空白、サーバーの並び順は
 * 違いとして数えない。
 */
export function promotionMismatches(
  form: PromotionForm,
  source: PromotionSource,
  option: { startDate: Date | string; endDate: Date | string | null }
): PromotionFixedField[] {
  const expected = promotionFixedValues(source, option)
  const text = (v: string | undefined) => (v ?? '').trim()

  return PROMOTION_FIXED_FIELDS.filter((field) => {
    if (field === 'allowedFediverseServers') {
      return !sameServers(form.allowedFediverseServers, expected.allowedFediverseServers)
    }
    if (
      field === 'isAllowedForFediverse' ||
      field === 'isAllowedForDiscord' ||
      field === 'isAllowedForTwitter'
    ) {
      return form[field] !== expected[field]
    }
    return text(form[field]) !== text(expected[field])
  })
}

/** 自動登録の判定に要る、回答1行 */
export type PromotionAnswer = {
  userId: string
  dateOptionId: string
  status: string
  autoRegisterWhenPromoted: boolean
  /** 規約への同意。規約の無い日程調整では見ない */
  termsAcceptedAt: Date | string | null
  user: { platform: string; server: string }
}

/**
 * イベントにしたときに自動で参加登録する人（の回答行）。
 *
 * - **選んだ候補日に○を付けた人だけ。** 回答画面で「○を付けた日に決まった
 *   場合だけ登録されます」と約束している。△は入れない
 * - 「自動で参加登録する」を選んだ人だけ
 * - **規約があるなら、同意を記録している人だけ。** 同意を取り始める前の回答は
 *   同意が無いので入れない（イベントの参加には同意が要る）
 * - **いまの参加条件を満たす人だけ。** 回答のあとで日程調整の参加条件が
 *   狭められていることがある
 * - 主催者本人は入れない（イベントの作成者は参加者の行を持たない）
 */
export function selectAutoRegistrants<A extends PromotionAnswer>(
  answers: readonly A[],
  context: {
    dateOptionId: string
    creatorId: string
    source: PromotionSource
  }
): A[] {
  const { source } = context
  const settings = {
    isAllowedForFediverse: source.isAllowedForFediverse,
    isAllowedForDiscord: source.isAllowedForDiscord,
    isAllowedForTwitter: source.isAllowedForTwitter,
    allowedFediverseServers:
      source.allowedServers.length > 0 ? JSON.stringify(source.allowedServers) : null,
  }

  return answers.filter(
    (a) =>
      a.dateOptionId === context.dateOptionId &&
      a.status === 'available' &&
      a.autoRegisterWhenPromoted &&
      a.userId !== context.creatorId &&
      (!source.terms || a.termsAcceptedAt !== null) &&
      isUserAllowed(a.user.platform, a.user.server, settings)
  )
}

/**
 * 定員が自動で登録する人数に足りないときの文言。足りていれば null。
 *
 * **作成を止める。** 誰を外すかをこちらで選ぶと、○を付けて自動登録を
 * 選んだ人のうち誰かとの約束を破ることになる。
 */
export function promotionCapacityError(
  maxParticipants: number | null | undefined,
  registrantCount: number
): string | null {
  if (maxParticipants == null || maxParticipants >= registrantCount) return null
  return `自動で参加登録する人が${registrantCount}人いるので、定員は${registrantCount}人以上にしてください`
}
