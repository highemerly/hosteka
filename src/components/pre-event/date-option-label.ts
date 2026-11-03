import { formatJstDate, formatJstTime, toJstDateInput } from '@/lib/jst'

/**
 * 候補日の「日付以外」の部分。日付そのものは左の日めくり（`DateBadge`）が出す。
 *
 * **表示から計算を切り離す**（入力側の `fields/date-option.ts` と同じ理由）。
 * 候補日は列が2つしか無く、「時刻を決めていない」も「複数日にわたる」も
 * 保存された日時から読み取るしかない。読み違えても画面はそれらしく見える。
 *
 * - 同じ日で時刻あり … 「19:00–21:00」「19:00〜」
 * - 時刻を決めていない … 空。**0時ちょうどは「決めていない」の意味**で
 *   保存されている（列が日時1つしかないため）。ここを素直に整形すると
 *   全部の候補に「00:00」が並ぶ（実際そうなっていた）
 * - 複数日にわたる … 「10:00〜9月14日(月) 15:00」「〜9月14日(月)」。
 *   **終了日を出さないと、回答する側には同じ日の10:00–15:00に見える**
 */

/**
 * 終了日の書き方。`full` は「9月14日(月)」、`short` は「9/14」。
 *
 * **短いほうは回答ダイアログのため。** あの行は日めくり・範囲・3択が
 * 横に並ぶので、長い日付を入れると狭い画面で3択が潰れる。
 */
export type RangeStyle = 'full' | 'short'

function dayLabel(iso: string, style: RangeStyle): string {
  return style === 'short'
    ? formatJstDate(iso, { month: 'numeric', day: 'numeric' })
    : formatJstDate(iso, { month: 'long', day: 'numeric', weekday: 'short' })
}

/** 0時ちょうどは「時刻を決めていない」。空を返す */
function timeLabel(iso: string): string {
  const time = formatJstTime(iso)
  return time === '00:00' ? '' : time
}

export function formatOptionRange(
  startDate: string,
  endDate: string | null,
  style: RangeStyle = 'full'
): string {
  const start = timeLabel(startDate)

  if (!endDate) return start ? `${start}〜` : ''

  const sameDay = toJstDateInput(startDate) === toJstDateInput(endDate)
  const end = timeLabel(endDate)

  if (sameDay) {
    // 同じ日の0時に終わる候補は「終了なし」と見分けが付かない。開始だけ出す
    if (!end) return start ? `${start}〜` : ''
    return start ? `${start}–${end}` : `〜${end}`
  }

  /*
    日をまたぐだけの候補（22:00–翌02:00）は「翌」で足りる。
    日付を足すと、1泊の合宿と同じ見え方になる。
  */
  if (start && end && isNextDay(startDate, endDate)) return `${start}–翌${end}`

  const day = dayLabel(endDate, style)
  const tail = end ? `${day} ${end}` : day
  return start ? `${start}〜${tail}` : `〜${tail}`
}

/** 終了が開始の翌日か。日付の文字列どうしで見る（時刻帯を挟まない） */
function isNextDay(startDate: string, endDate: string): boolean {
  const start = new Date(`${toJstDateInput(startDate)}T00:00:00+09:00`)
  const end = new Date(`${toJstDateInput(endDate)}T00:00:00+09:00`)
  return end.getTime() - start.getTime() === 86400000
}
