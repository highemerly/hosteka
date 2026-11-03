/**
 * カレンダーの升目を組む。
 *
 * **日付の計算は表示から切り離す。** 月初の曜日ずれ、月末の日数、
 * 「今日」の判定はどれも境界で間違えやすく、間違えても画面は
 * それらしく見えてしまう。
 *
 * すべて**ローカル時刻**で扱う。`YYYY-MM-DD` は「その日」を表す文字列で
 * あって時刻ではないので、UTC で組むと日本では1日ずれる。
 */

/** `YYYY-MM-DD`。ローカル時刻の年月日をそのまま使う */
export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** `YYYY-MM-DD` を、その日の 0 時の Date にする */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * `YYYY-MM-DD` の n 日後。
 *
 * **手で足さない。** 月末・年末をまたぐ計算は境界で間違えやすく、
 * 間違えても画面はそれらしく見えてしまう。`Date` に任せて組み直す。
 */
export function addDays(key: string, days: number): string {
  const date = fromDateKey(key)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

/**
 * その月の升目。**日曜始まり。** 月初までは null で埋める。
 * 末尾は埋めない（最終週が短くても、空の升目に意味はない）。
 */
export function monthGrid(year: number, month0: number): (Date | null)[] {
  const first = new Date(year, month0, 1)
  const lastDay = new Date(year, month0 + 1, 0).getDate()

  const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null)
  for (let d = 1; d <= lastDay; d++) cells.push(new Date(year, month0, d))
  return cells
}

/** 同じ日か。時刻は見ない */
export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b)
}

/** その日が過去か。**今日は過去に含めない** — 当日の候補は立てられる */
export function isPastDay(date: Date, now = new Date()): boolean {
  return toDateKey(date) < toDateKey(now)
}

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** 曜日の色。日曜は赤、土曜は青。カレンダーの慣習に合わせる */
export function weekdayTone(dayOfWeek: number): 'sunday' | 'saturday' | 'weekday' {
  if (dayOfWeek === 0) return 'sunday'
  if (dayOfWeek === 6) return 'saturday'
  return 'weekday'
}
