import { isUrlLocation } from '@/components/event/location'
import { formatOptionRange } from '@/components/pre-event/date-option-label'
import { formatJstDateTime, jstParts } from '@/lib/jst'

import { LOCATION_MAX, stripEmoji, TITLE_MAX, truncate } from './event-card'

/**
 * 日程調整の OG 画像（リンクカードの画像）に描く中身。描画（`server/og/`）から切り離して、
 * テストで固定する。
 *
 * **編集しなければ変わらない値だけを載せる**（`event-card.ts` と同じ）。回答の数や
 * 「受付中」のような、編集せずに変わる値は載せない。候補日を変える編集も
 * `pre_events` の行を書き換えるので、`updatedAt`（画像の版）が進む。
 */

/** 並べる候補日の数。超えた分は「他N件」 */
export const OPTIONS_MAX = 4

export type PreEventCardRow = {
  title: string
  location: string | null
  registrationDeadline: Date | null
  /** 画面と同じ順（`displayOrder`）で渡す */
  dateOptions: { startDate: Date; endDate: Date | null }[]
  creator: { displayName: string }
  organization: { name: string } | null
}

export type PreEventCardOption = {
  month: number
  day: number
  weekday: string
  /** 「19:00–21:00」など。時刻を決めていない候補は空 */
  time: string
}

export type PreEventCard = {
  title: string
  options: PreEventCardOption[]
  /** 並べきれなかった候補の数 */
  more: number
  location: string | null
  organizer: string
  /** 「11月15日(土) 23:59」。無ければ null */
  deadline: string | null
}

const WEEKDAY = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' })

export function preEventCard(row: PreEventCardRow): PreEventCard {
  const location = row.location?.trim()
    ? isUrlLocation(row.location)
      ? 'オンライン'
      : truncate(stripEmoji(row.location), LOCATION_MAX)
    : null

  return {
    title: truncate(stripEmoji(row.title) || '日程調整', TITLE_MAX),
    options: row.dateOptions.slice(0, OPTIONS_MAX).map(({ startDate, endDate }) => {
      const start = jstParts(startDate)
      return {
        month: start.month,
        day: start.day,
        weekday: WEEKDAY.format(startDate),
        // 狭い枠に収めるので、日をまたぐ候補の終了日は短い形（9/14）
        time: formatOptionRange(startDate.toISOString(), endDate?.toISOString() ?? null, 'short'),
      }
    }),
    more: Math.max(0, row.dateOptions.length - OPTIONS_MAX),
    location: location || null,
    organizer: truncate(stripEmoji(row.organization?.name ?? row.creator.displayName), 30),
    deadline: row.registrationDeadline
      ? formatJstDateTime(row.registrationDeadline, {
          month: 'long',
          day: 'numeric',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null,
  }
}
