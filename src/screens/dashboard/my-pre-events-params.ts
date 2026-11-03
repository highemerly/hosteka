import type { MyPreEventsRole, MyPreEventsScope } from '@/schemas/pre-event'

/**
 * `/dashboard/my-pre-events` の絞り込みと URL の相互変換。
 *
 * **イベント側（`my-events-params.ts`）と同じ形にしてある。** 語彙が
 * 画面ごとに違うと、行き来するたびに読み替えが要る。違いは
 * 「回答で絞る」「中止を含める」が無いことと、期間の語（下の `SCOPES`）。
 */

export type MyPreEventsFilters = {
  role: MyPreEventsRole
  scope: MyPreEventsScope
  page: number
}

/** 文言はイベント側と揃える。ただし日程調整の「参加」は「回答」 */
export const ROLES: { value: MyPreEventsRole; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'created', label: '主催' },
  { value: 'participating', label: '回答' },
]

/**
 * イベント側は「開催予定 / 終了」だが、日程調整に開催日は無い。
 * 終わったかどうかは**候補日**で決まる（先の候補日が1つでも残っていれば今後、
 * 1つも無ければ過去）ので、開催を指す語を借りない。
 */
export const SCOPES: { value: MyPreEventsScope; label: string }[] = [
  { value: 'upcoming', label: '今後' },
  { value: 'past', label: '過去' },
]

export const DEFAULT_FILTERS: MyPreEventsFilters = {
  role: 'all',
  scope: 'upcoming',
  page: 1,
}

function pick<T extends string>(
  options: { value: T }[],
  value: string | null,
  fallback: T
): T {
  return options.some((o) => o.value === value) ? (value as T) : fallback
}

/**
 * URL から絞り込みを読む。
 * **読めない値はすべて既定に倒す。** 手で書き換えられる前提で扱う。
 *
 * 旧画面の `?default=created` も受ける。マイページからのリンクは
 * 付け替えたが、**貼られた URL は残る**（旧画面はこの形しか持っていなかった）。
 */
export function readMyPreEventsFilters(params: URLSearchParams): MyPreEventsFilters {
  const legacy = params.get('default')
  return {
    role: pick(ROLES, params.get('role') ?? legacy, DEFAULT_FILTERS.role),
    scope: pick(SCOPES, params.get('scope'), DEFAULT_FILTERS.scope),
    page: Math.max(Number(params.get('page')) || 1, 1),
  }
}

/**
 * 次の URL のクエリ文字列を組み立てる。
 *
 * **既定値は書かない。** 全部を並べると、どれを自分で選んだのかが
 * URL から読めなくなる。
 * **絞り込みを変えたらページは1に戻す。** 3ページ目のまま条件を変えると、
 * たいてい何も無いページに着く。
 */
export function buildMyPreEventsQuery(
  current: MyPreEventsFilters,
  next: Partial<MyPreEventsFilters>
): string {
  const merged = { ...current, ...next }
  const changedFilter = Object.keys(next).some((key) => key !== 'page')
  const page = changedFilter ? 1 : merged.page

  const params = new URLSearchParams()
  if (merged.role !== DEFAULT_FILTERS.role) params.set('role', merged.role)
  if (merged.scope !== DEFAULT_FILTERS.scope) params.set('scope', merged.scope)
  if (page > 1) params.set('page', String(page))

  const query = params.toString()
  return query ? `?${query}` : ''
}
