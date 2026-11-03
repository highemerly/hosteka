import 'server-only'

import { ANNOUNCEMENT_TYPES, type AnnouncementType } from '@/schemas/announcement'
import type { AnnouncementRow } from '@/server/queries/announcement'

/**
 * お知らせ1件。**公開側と管理側で同じ形を返す。**
 * 管理側だけが予約中のものと掲載の終わったものも受け取る。
 */
export type AnnouncementDto = {
  id: number
  type: AnnouncementType
  title: string
  /** Markdown。**null なら詳細ページを作らない** */
  body: string | null
  publishedAt: string
  /** バナーを降ろす日時。null は「公開から既定の日数で降ろす」 */
  pinnedUntil: string | null
}

/**
 * `type` は文字列カラムなので、知らない値が入りうる（古い行・手で入れた行）。
 * **画面に落とさせない** — 知らない値は「お知らせ」に寄せる。
 */
function toType(raw: string): AnnouncementType {
  return (ANNOUNCEMENT_TYPES as readonly string[]).includes(raw)
    ? (raw as AnnouncementType)
    : 'info'
}

export function serializeAnnouncement(row: AnnouncementRow): AnnouncementDto {
  return {
    id: row.id,
    type: toType(row.type),
    title: row.title,
    body: row.body,
    publishedAt: row.publishedAt.toISOString(),
    pinnedUntil: row.pinnedUntil ? row.pinnedUntil.toISOString() : null,
  }
}
