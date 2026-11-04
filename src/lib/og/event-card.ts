import { isUrlLocation } from '@/components/event/location'
import { composeDateTime } from '@/lib/event-datetime'
import { formatSchedule } from '@/lib/event-schedule'
import { jstParts } from '@/lib/jst'

/**
 * イベントの OG 画像（リンクカードの画像）に描く中身。描画（`server/og/`）から切り離して、
 * テストで固定する。
 *
 * **編集しなければ変わらない値だけを載せる。** 画像の URL は `updatedAt` を版に持ち、
 * CDN に長く持たせる（`/og/events/[id]`）。参加者の数のように編集せずに変わる値を
 * 載せると、古い数が出続ける。
 */

export const TITLE_MAX = 60
export const LOCATION_MAX = 40

export type EventCardRow = {
  title: string
  startDate: Date
  startTime: string | null
  hasStartTime: boolean
  endDate: Date | null
  endTime: string | null
  hasEndTime: boolean
  location: string | null
  status: string
  creator: { displayName: string }
  organization: { name: string } | null
}

export type EventCard = {
  title: string
  /** 日めくりのバッジ（詳細ページの `DateBadge` と同じ形で描く） */
  badge: { month: number; day: number; weekday: string }
  schedule: string
  /** URL の会場は「オンライン」。無ければ null */
  location: string | null
  /** 主催の名義。グループ名義ならグループ名 */
  organizer: string
  cancelled: boolean
}

/**
 * 絵文字を落とす。**フォントに絵文字の字形が無い**ので、残すと豆腐（□）になる。
 * 結合子（ZWJ）・異体字セレクタ・肌の色・国旗の部品も一緒に落とす。
 */
export function stripEmoji(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{200D}\u{FE0F}\u{20E3}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 文字（コードポイント）で数えて切り詰める。切ったら末尾に「…」 */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text)
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`
}

const WEEKDAY = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' })

export function eventCard(row: EventCardRow): EventCard {
  const startDate = composeDateTime(row.startDate, row.startTime, row.hasStartTime)
  const endDate = row.endDate ? composeDateTime(row.endDate, row.endTime, row.hasEndTime) : null
  const start = jstParts(startDate)

  const location = row.location?.trim()
    ? isUrlLocation(row.location)
      ? 'オンライン'
      : truncate(stripEmoji(row.location), LOCATION_MAX)
    : null

  return {
    title: truncate(stripEmoji(row.title) || 'イベント', TITLE_MAX),
    badge: { month: start.month, day: start.day, weekday: WEEKDAY.format(new Date(startDate)) },
    schedule: formatSchedule({ startDate, endDate, hasStartTime: row.hasStartTime, hasEndTime: row.hasEndTime }),
    location: location || null,
    organizer: truncate(stripEmoji(row.organization?.name ?? row.creator.displayName), 30),
    cancelled: row.status === 'cancelled',
  }
}
