/**
 * 日時の入出力の小さな補助。
 *
 * **イベントとして意味のある判定（終了したか・締切を過ぎたか）はここに無い。**
 * 日付列と時刻列から本物の瞬間を作るのは `@/lib/event-datetime`、
 * 整形と JST の部品取りは `@/lib/jst` が持つ。
 */

import { toJstWallClock } from './jst'

/**
 * ISO8601文字列をDateオブジェクトに変換。無効な値は null を返す。
 */
export function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  const date = new Date(dateStr)
  return isNaN(date.getTime()) ? null : date
}

/**
 * UTC日時をJSTに変換
 *
 * 中身は `@/lib/jst` に移した。以前はここで
 * `new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))` と
 * **文字列に落として読み直していた**が、この形の `new Date(...)` は
 * 解釈が実装依存（ECMA-262）で、ミリ秒も落ちる。
 * 約束（ローカル getter で JST の部品が読める）は変えていない。
 *
 * **戻り値は瞬間としては正しくない**（`toJstWallClock` の説明を参照）。
 */
export function toJST(date: Date | string): Date {
  return toJstWallClock(date)
}

/**
 * 日付文字列（YYYY-MM-DD）と時刻文字列（HH:MM）をJSTとして解釈し、UTCのDateオブジェクトに変換
 * フォーム入力からDB保存用の変換に使用
 *
 * @param dateStr 日付文字列（YYYY-MM-DD形式）
 * @param timeStr 時刻文字列（HH:MM形式）、省略時は00:00
 * @returns UTCのDateオブジェクト
 */
export function parseJSTDateTimeToUTC(dateStr: string, timeStr?: string | null): Date {
  // JSTタイムゾーンを明示的に指定してパース
  const time = timeStr || '00:00'
  const isoString = `${dateStr}T${time}:00+09:00`
  return new Date(isoString)
}
