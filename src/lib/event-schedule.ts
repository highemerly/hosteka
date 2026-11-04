import { jstParts } from '@/lib/jst'

/** 開催日時の表示に要るもの。詳細の DTO と、OG 画像が組み立てる値の両方が満たす */
export type ScheduleInput = {
  /** ISO 文字列（`composeDateTime` が作る瞬間） */
  startDate: string
  endDate: string | null
  hasStartTime: boolean
  hasEndTime: boolean
}

function format(iso: string, withTime: boolean): string {
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

function sameJstDay(a: string, b: string): boolean {
  const x = jstParts(a)
  const y = jstParts(b)
  return x.year === y.year && x.month === y.month && x.day === y.day
}

/**
 * JST で「2026年9月12日(土) 19:00 〜 22:00」の形にする。
 *
 * **詳細ページと OG 画像で同じものを使う。** 同じ日かどうかも JST で見る
 * （実行環境の時刻帯で見ると、本番（UTC）と利用者の端末で答えが割れる）。
 */
export function formatSchedule(e: ScheduleInput): string {
  const start = format(e.startDate, e.hasStartTime)
  if (!e.endDate) return start

  if (sameJstDay(e.startDate, e.endDate) && e.hasEndTime) {
    const endTime = new Date(e.endDate).toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
    })
    return `${start} 〜 ${endTime}`
  }
  return `${start} 〜 ${format(e.endDate, e.hasEndTime)}`
}
