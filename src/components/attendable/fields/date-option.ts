/**
 * 候補日1つ分の値と、その見せ方。
 *
 * **表示から計算を切り離す。** 「同じ候補かどうか」「日をまたぐか」は
 * どちらも境界で間違えやすく、間違えても画面はそれらしく見えてしまう。
 * 候補の見分けを誤ると回答が消える（`DateOptionsField` の説明を参照）ので、
 * ここだけをテストで固定する。
 */

import { addDays, fromDateKey, WEEKDAYS } from './date-grid'

export type DateOptionDraft = {
  /** `YYYY-MM-DD` */
  startDate: string
  /** `HH:MM`。時刻を決めない候補もある */
  startTime?: string
  /** 複数日にわたる候補だけが持つ。日をまたぐだけなら終了時刻で表す */
  endDate?: string
  endTime?: string
}

/**
 * 候補の見分け方。
 *
 * **回答が付いているかどうかは、日付だけでは決まらない。** 同じ日に
 * 13:00 と 19:00 の2枠を立てられるので、日付と時刻をすべて含めて
 * 1つの候補とする。保存済みの回答を数えるときも同じ鍵で引く。
 */
export function dateOptionKey(option: DateOptionDraft): string {
  return [option.startDate, option.startTime, option.endDate, option.endTime]
    .map((v) => v ?? '')
    .join('|')
}

/** 「9月12日(土)」 */
export function formatDay(key: string): string {
  const d = fromDateKey(key)
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`
}

/** 「(土)」。日付の入力欄の隣に出す。打ち間違えは曜日で気づくことが多い */
export function weekdayLabel(key: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return ''
  return `(${WEEKDAYS[fromDateKey(key).getDay()]})`
}

/**
 * 終了が翌日か。**終了時刻が開始より前なら日をまたぐ**
 * （`screens/pre-events/pre-event-payload.ts` の `resolveEndDate` と同じ規則）。
 * 規則を書き分けると、画面の見え方と保存される日時が食い違う。
 */
export function endsNextDay(option: DateOptionDraft): boolean {
  return Boolean(
    !option.endDate && option.startTime && option.endTime && option.endTime < option.startTime
  )
}

/** 「19:00–21:00」「19:00〜」「22:00–翌02:00」。時刻が無ければ空 */
export function formatTimeRange(option: DateOptionDraft): string {
  if (!option.startTime && !option.endTime) return ''
  if (!option.endTime) return `${option.startTime}〜`
  const end = `${endsNextDay(option) ? '翌' : ''}${option.endTime}`
  return option.startTime ? `${option.startTime}–${end}` : `〜${end}`
}

/**
 * 複数日にわたる候補の終了日。
 *
 * 「日数」の欄を出していないときに、何日までの候補なのかを文字で見せる。
 * 黙って隠すと、分からないまま保存することになる。
 */
export function spanEndLabel(option: DateOptionDraft): string | null {
  if (!option.endDate || option.endDate === option.startDate) return null
  return `〜${formatDay(option.endDate)}`
}

/**
 * 候補が何日間か。**開始日を1日目と数える**（9/12–9/14 なら 3）。
 *
 * **終了日を持たない候補は1日間。** 22:00–翌02:00 も1日間として扱う —
 * あれは終了「時刻」で表していて（`endsNextDay`）、日数の話ではない。
 * ここで2日間と数えると、日数をまとめて変えたときに巻き込んで
 * 夜またぎの候補が勝手に泊まりがけになる。
 */
export function spanDays(option: DateOptionDraft): number {
  if (!option.startDate || !option.endDate) return 1
  const diff =
    (fromDateKey(option.endDate).getTime() - fromDateKey(option.startDate).getTime()) / 86400000
  return diff > 0 ? Math.round(diff) + 1 : 1
}

/**
 * 日数から終了日を決める。
 *
 * **1日間なら終了日を持たせない。** 開始日と同じ終了日を書くと、
 * 保存の形が「終了なし」から「その日の0時に終わる」に変わってしまう
 * （`pre-event-payload.ts` の `resolveEndDate`）。
 */
export function endDateForSpan(startDate: string, days: number): string | undefined {
  if (!startDate || days <= 1) return undefined
  return addDays(startDate, days - 1)
}

/** 候補の日数を変える。開始日はそのまま */
export function withSpanDays(option: DateOptionDraft, days: number): DateOptionDraft {
  return { ...option, endDate: endDateForSpan(option.startDate, days) }
}

/**
 * 開始日を変える。**日数は保つ** — 9/12–9/14 を 9/19 へ移したら 9/19–9/21。
 * 終了日を据え置くと、開始より前の終了日という壊れた候補ができる。
 */
export function withStartDate(option: DateOptionDraft, startDate: string): DateOptionDraft {
  return { ...option, startDate, endDate: endDateForSpan(startDate, spanDays(option)) }
}

/**
 * 終了の欄（終了日と終了時刻）を出すか。`shouldShowTime` と同じ理由で
 * マウント時に決め打ちしない（保存済みの候補は `reset()` であとから流し込まれる）。
 *
 * **終了時刻も見る。** 22:00–翌02:00 は `spanDays` では1日間なので、
 * 日数だけで判断すると欄が出ず、**02:00 を直す手段が無くなる**。
 *
 * @param mode 利用者が「終了日時を指定／指定をやめる」で決めた値。未操作なら null
 */
export function shouldShowEnd(mode: boolean | null, options: DateOptionDraft[]): boolean {
  return mode ?? options.some((o) => spanDays(o) > 1 || Boolean(o.endTime))
}

/** 空文字は「未入力」に均す。`''` と `undefined` が混ざると候補の鍵が変わる */
export function orUndefined(value: string): string | undefined {
  return value ? value : undefined
}

/** 日付・時刻の順。並べておくと、抜けや重なりに気づける */
export function byDateTime(a: DateOptionDraft, b: DateOptionDraft): number {
  if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate)
  return (a.startTime ?? '').localeCompare(b.startTime ?? '')
}

/**
 * 時刻の欄を出すか。
 *
 * **マウント時の値で決め打ちしない。** 編集画面ではフォームの初期値が
 * 空で、保存済みの候補は `reset()` であとから流し込まれる。マウント時に
 * 決めると、時刻を持つ候補を開いても欄が出ず、時刻が消えたように見える。
 *
 * @param mode 利用者が「時刻を指定／指定をやめる」で決めた値。未操作なら null
 */
export function shouldShowTime(mode: boolean | null, options: DateOptionDraft[]): boolean {
  return mode ?? options.some((o) => Boolean(o.startTime || o.endTime))
}
