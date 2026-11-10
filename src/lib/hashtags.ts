import type { HashtagScope } from '@/schemas/hashtag'

/**
 * ハッシュタグの列。**イベントと日程調整で同じ持ち方をする**（JSON 文字列の配列）。
 *
 * 日程調整のタグはイベントにするときにそのまま写る。持ち方が違うと、
 * 写すところで片方の形に直す処理が要る。
 */

/** 配列のまま持てない列なので JSON にする。空は null（「無し」と「空配列」を分けない） */
export function hashtagsToColumn(tags: string[] | undefined): string | null {
  return tags && tags.length > 0 ? JSON.stringify(tags) : null
}

/** 列を配列に戻す。壊れていても落とさない */
export function hashtagsFromColumn(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

/**
 * タグのページ。イベントと日程調整の両方を出す（`app/hashtags/[hashtag]`）。
 * 既定の切り替え（`upcoming`）は URL に書かない
 */
export function hashtagPath(tag: string, scope?: HashtagScope): string {
  const path = `/hashtags/${encodeURIComponent(tag)}`
  return scope && scope !== 'upcoming' ? `${path}?scope=${scope}` : path
}
