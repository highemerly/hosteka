import {
  KINDS_BY_CATEGORY,
  KIND_CATEGORY,
  type NotificationCategory,
  type NotificationKind,
} from '@/schemas/notification'
import { KIND_LABEL_JA } from '@/lib/notification-text'

/**
 * `/dashboard/notifications` の絞り込みと URL の相互変換。
 *
 * **画面から切り出してある。** 「既定値は URL に書かない」「絞り込みを
 * 変えたらページを1に戻す」は、どちらも壊れても画面上は正常に見える
 * （URL が長くなる／空のページに着く、という形でしか現れない）。
 */

export type NotificationsFilters = {
  category: NotificationCategory | 'all'
  /** 細かい絞り込み。`category` を選んでいるときだけ意味がある */
  kind: NotificationKind | 'all'
  page: number
}

/**
 * 粗い軸。**4つまで**にしてある — 狭い画面（375px）で折り返さない上限。
 * これ以上の細かさは下の `Select` が引き受ける。
 */
export const CATEGORIES: { value: NotificationCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'organizer', label: '主催' },
  { value: 'participant', label: '参加' },
  { value: 'role', label: '役割' },
]

/**
 * 細かい軸。分類ごとの選択肢を `KIND_LABEL_JA` から組み立てる。
 * **画面に種別の一覧を書き写さない** — 種別を足したときに片方だけ古くなる。
 */
export function kindOptions(
  category: NotificationCategory | 'all'
): { value: NotificationKind | 'all'; label: string }[] {
  if (category === 'all') return []
  return [
    { value: 'all', label: 'すべての通知' },
    ...KINDS_BY_CATEGORY[category].map((kind) => ({ value: kind, label: KIND_LABEL_JA[kind] })),
  ]
}

export const DEFAULT_FILTERS: NotificationsFilters = {
  category: 'all',
  kind: 'all',
  page: 1,
}

/**
 * URL から絞り込みを読む。
 * **読めない値はすべて既定に倒す。** 手で書き換えられる前提で扱う。
 */
export function readNotificationsFilters(params: URLSearchParams): NotificationsFilters {
  const rawCategory = params.get('category')
  const category = CATEGORIES.some((c) => c.value === rawCategory)
    ? (rawCategory as NotificationCategory | 'all')
    : DEFAULT_FILTERS.category

  const rawKind = params.get('kind')
  /*
    **分類に属さない種別は捨てる。** 「役割の、参加リクエストだけ」のような
    URL を手で作れてしまい、サーバーは正しく空を返すが、画面には
    選ばれていない選択肢が残って「壊れている」ように見える。
  */
  const kind =
    rawKind && category !== 'all' && KIND_CATEGORY[rawKind as NotificationKind] === category
      ? (rawKind as NotificationKind)
      : DEFAULT_FILTERS.kind

  return { category, kind, page: Math.max(Number(params.get('page')) || 1, 1) }
}

/**
 * 次の URL のクエリ文字列を組み立てる。
 *
 * **既定値は書かない。** 全部を並べると、どれを自分で選んだのかが
 * URL から読めなくなる。
 * **絞り込みを変えたらページは1に戻す。** 3ページ目のまま条件を変えると、
 * たいてい何も無いページに着く。
 */
export function buildNotificationsQuery(
  current: NotificationsFilters,
  next: Partial<NotificationsFilters>
): string {
  const merged = { ...current, ...next }
  const changedFilter = Object.keys(next).some((key) => key !== 'page')
  const page = changedFilter ? 1 : merged.page

  // 分類を変えたら、前の分類に属する種別は残さない
  const kind =
    next.category !== undefined && next.kind === undefined ? DEFAULT_FILTERS.kind : merged.kind

  const params = new URLSearchParams()
  if (merged.category !== DEFAULT_FILTERS.category) params.set('category', merged.category)
  if (kind !== DEFAULT_FILTERS.kind) params.set('kind', kind)
  if (page > 1) params.set('page', String(page))

  const query = params.toString()
  return query ? `?${query}` : ''
}
