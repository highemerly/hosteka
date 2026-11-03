import type { MyEventsRole, MyEventsScope, MyEventsStatus } from '@/schemas/event'

/**
 * `/dashboard/my-events` の絞り込みと URL の相互変換。
 *
 * **画面から切り出してある。** 「既定値は URL に書かない」「絞り込みを
 * 変えたらページを1に戻す」は、どちらも壊れても画面上は正常に見える
 * （URL が長くなる／空のページに着く、という形でしか現れない）。
 */

export type MyEventsFilters = {
  role: MyEventsRole
  scope: MyEventsScope
  status: MyEventsStatus
  page: number
}

export const ROLES: { value: MyEventsRole; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'created', label: '主催' },
  { value: 'participating', label: '参加' },
]

export const SCOPES: { value: MyEventsScope; label: string }[] = [
  { value: 'upcoming', label: '開催予定' },
  { value: 'past', label: '終了' },
]

/** 回答の絞り込み。文言は参加者一覧（ParticipantList）と揃える */
export const STATUSES: { value: MyEventsStatus; label: string }[] = [
  { value: 'all', label: 'すべての回答' },
  { value: 'attending', label: '参加' },
  { value: 'maybe', label: '未定' },
  { value: 'participation_request', label: '参加リクエスト' },
  { value: 'not_attending', label: '欠席' },
  { value: 'cancelled', label: 'キャンセル' },
]

export const DEFAULT_FILTERS: MyEventsFilters = {
  role: 'all',
  scope: 'upcoming',
  status: 'all',
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
 */
export function readMyEventsFilters(params: URLSearchParams): MyEventsFilters {
  return {
    role: pick(ROLES, params.get('role'), DEFAULT_FILTERS.role),
    scope: pick(SCOPES, params.get('scope'), DEFAULT_FILTERS.scope),
    status: pick(STATUSES, params.get('status'), DEFAULT_FILTERS.status),
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
export function buildMyEventsQuery(
  current: MyEventsFilters,
  next: Partial<MyEventsFilters>
): string {
  const merged = { ...current, ...next }
  const changedFilter = Object.keys(next).some((key) => key !== 'page')
  const page = changedFilter ? 1 : merged.page

  const params = new URLSearchParams()
  if (merged.role !== DEFAULT_FILTERS.role) params.set('role', merged.role)
  if (merged.scope !== DEFAULT_FILTERS.scope) params.set('scope', merged.scope)
  if (merged.status !== DEFAULT_FILTERS.status) params.set('status', merged.status)
  if (page > 1) params.set('page', String(page))

  const query = params.toString()
  return query ? `?${query}` : ''
}
