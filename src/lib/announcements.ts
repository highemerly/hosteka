import type { AnnouncementType } from '@/schemas/announcement'

/**
 * お知らせの「いつ出すか」を決める規則。**ここが唯一の定義元。**
 *
 * このファイルは isomorphic（prisma も server-only も import しない）。
 * サーバーは一覧とバナーの絞り込みに、画面は閉じたものを隠すのに、同じ関数を使う。
 *
 * **時刻の判定はサーバーの `now` で行う。** 閲覧者の端末の時計に任せると、
 * ずれている人にだけバナーが出たり消えたりする。画面が自分で判定するのは
 * 「この人が閉じたかどうか」（Cookie）だけ。
 */

/** バナーを降ろすまでの既定の日数。`pinnedUntil` 未指定のときに使う */
export const DEFAULT_BANNER_DAYS = 7

/** 掲載の判定に要る最小限。DTO はこれを満たす */
export type AnnouncementVisibility = {
  id: number
  type: AnnouncementType
  publishedAt: string
  pinnedUntil: string | null
}

/** `now`（epoch ms）の時点で公開済みか。未来の日時を入れると予約になる */
export function isPublished(a: AnnouncementVisibility, now: number): boolean {
  return new Date(a.publishedAt).getTime() <= now
}

/**
 * バナーを降ろす時刻（epoch ms）。
 * `pinnedUntil` があればその日時、無ければ公開から `DEFAULT_BANNER_DAYS` 日後。
 */
export function bannerEndsAt(a: AnnouncementVisibility): number {
  if (a.pinnedUntil) return new Date(a.pinnedUntil).getTime()
  return new Date(a.publishedAt).getTime() + DEFAULT_BANNER_DAYS * 24 * 60 * 60 * 1000
}

/** バナーに出しうる重要度か。**"low" は全員の画面の上に出さない** */
export function isBannerEligible(a: AnnouncementVisibility): boolean {
  return a.type !== 'low'
}

/** `now` の時点でバナーに出すか（公開済み・バナー対象・掲載期間内） */
export function isPinnedNow(a: AnnouncementVisibility, now: number): boolean {
  return isBannerEligible(a) && isPublished(a, now) && now < bannerEndsAt(a)
}

/** バナーに出すものを新しい順に。並びは一覧と揃える */
export function bannerAnnouncements<T extends AnnouncementVisibility>(
  all: T[],
  now: number
): T[] {
  return all.filter((a) => isPinnedNow(a, now)).sort(byNewest)
}

/** 一覧に出すものを新しい順に */
export function listedAnnouncements<T extends AnnouncementVisibility>(
  all: T[],
  now: number
): T[] {
  return all.filter((a) => isPublished(a, now)).sort(byNewest)
}

/** 新しい順。同じ日時なら id で決める（並びが呼ぶたびに変わらないように） */
function byNewest(a: AnnouncementVisibility, b: AnnouncementVisibility): number {
  return b.publishedAt.localeCompare(a.publishedAt) || b.id - a.id
}

// =============================================================================
// 閉じたバナー（Cookie）
// =============================================================================
//
// **「ここまで読んだ」ではなく「閉じたものの集合」で持つ。** 予約公開があるので
// 作った順と公開順は一致しない。「この時刻より前のものは読んだ」で持つと、
// あとから公開される予約分が、先に閉じた新しいお知らせに飛び越されて
// 二度と出なくなる。
//
// 集合には**いまバナーに出ているものだけ**を入れ直す（`readIdsAfterDismiss`）。
// 掲載が終われば自然に集合から外れるので、Cookie は同時掲載件数に張り付く。

/** Cookie の値（`1-2-3`）を読む。数字でないものは捨てる（手で書き換えられうる） */
export function parseReadIds(raw: string | null | undefined): Set<number> {
  if (!raw) return new Set()
  return new Set(raw.split('-').filter((id) => /^\d+$/.test(id)).map(Number))
}

/** 集合を Cookie の値にする */
export function serializeReadIds(ids: number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join('-')
}

/**
 * 「閉じる」を押したあとの Cookie の中身。
 *
 * **いま出ているものだけに入れ替える。** 足し続けると Cookie が
 * 全リクエストに載ったまま太り続ける。
 */
export function readIdsAfterDismiss(active: AnnouncementVisibility[]): string {
  return serializeReadIds(active.map((a) => a.id))
}

/** まだ閉じられていないものだけを返す */
export function unreadAnnouncements<T extends AnnouncementVisibility>(
  active: T[],
  rawCookie: string | null | undefined
): T[] {
  const read = parseReadIds(rawCookie)
  return active.filter((a) => !read.has(a.id))
}
