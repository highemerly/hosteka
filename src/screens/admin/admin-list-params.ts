/**
 * 管理画面の一覧の絞り込みと URL の相互変換。
 *
 * **5つの一覧で同じ規則にする。** 「既定値は URL に書かない」
 * 「絞り込みを変えたらページを1に戻す」「読めない値は既定に倒す」は、
 * どれも壊れても画面は正常に見える（URL が長くなる／空のページに着く
 * ／手で書き換えた URL で落ちる）。一覧ごとに書くと必ず1つずれる。
 *
 * 一覧ごとの違いは「どの項目を持つか」と「選べる値」だけで、
 * それを `ListSpec` で渡す。
 */

type Field<V extends string> = {
  default: V
  /** 選べる値。無ければ自由入力（検索語・ID） */
  options?: readonly { value: V; label: string }[]
}

export type ListSpec<F extends Record<string, string>> = { [K in keyof F]: Field<F[K]> }

export type ListState<F extends Record<string, string>> = F & { page: number }

/**
 * URL から絞り込みを読む。
 * **読めない値はすべて既定に倒す。** 手で書き換えられる前提で扱う。
 */
export function readListParams<F extends Record<string, string>>(
  params: URLSearchParams,
  spec: ListSpec<F>
): ListState<F> {
  const out: Record<string, string | number> = {}

  for (const key of Object.keys(spec) as (keyof F & string)[]) {
    const field = spec[key]
    const raw = params.get(key)?.trim() ?? ''
    if (field.options) {
      out[key] = field.options.some((o) => o.value === raw) ? raw : field.default
    } else {
      out[key] = raw || field.default
    }
  }

  out.page = Math.max(Math.floor(Number(params.get('page'))) || 1, 1)
  return out as ListState<F>
}

/**
 * 次の URL のクエリ文字列を組み立てる（先頭の `?` 付き。何も無ければ空文字）。
 *
 * **既定値は書かない。** 全部を並べると、どれを自分で選んだのかが
 * URL から読めなくなる。
 * **絞り込みを変えたらページは1に戻す。** 3ページ目のまま条件を変えると、
 * たいてい何も無いページに着く。
 */
export function buildListQuery<F extends Record<string, string>>(
  spec: ListSpec<F>,
  current: ListState<F>,
  next: Partial<ListState<F>>
): string {
  const merged = { ...current, ...next }
  const changedFilter = Object.keys(next).some((key) => key !== 'page')
  const page = changedFilter ? 1 : merged.page

  const params = new URLSearchParams()
  for (const key of Object.keys(spec) as (keyof F & string)[]) {
    const value = String(merged[key] ?? '').trim()
    if (value && value !== spec[key].default) params.set(key, value)
  }
  if (page > 1) params.set('page', String(page))

  const query = params.toString()
  return query ? `?${query}` : ''
}

/**
 * 並び順は「項目-向き」の1つの値で持つ。
 * 項目と向きを別々の選択にすると、「開催日の古い順」を選ぶのに2回操作が要り、
 * 途中の組み合わせで一度読み込みが走る。
 */
export function splitSort<S extends string, O extends 'asc' | 'desc'>(
  value: `${S}-${O}`
): { sortBy: S; sortOrder: O } {
  const at = value.lastIndexOf('-')
  return { sortBy: value.slice(0, at) as S, sortOrder: value.slice(at + 1) as O }
}

// =============================================================================
// 一覧ごとの定義
// =============================================================================

/**
 * 公開状態。**イベントと日程調整で同じ語を使う。** 片方だけ
 * 「公開中」、もう片方が「公開」だと、別の状態に見える。
 */
export const VISIBILITY_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'public', label: '公開' },
  { value: 'private', label: '非公開' },
  { value: 'disabled', label: '無効化' },
] as const

export type Visibility = (typeof VISIBILITY_OPTIONS)[number]['value']

export const REPORTS_SPEC: ListSpec<{ status: 'pending' | 'resolved' | 'all' }> = {
  status: {
    // 開いて最初に見たいのは対応が要るもの。API の既定とも揃える
    default: 'pending',
    options: [
      { value: 'pending', label: '未処理' },
      { value: 'resolved', label: '解決済み' },
      { value: 'all', label: 'すべて' },
    ],
  },
}

export const EVENTS_SPEC: ListSpec<{
  q: string
  status: Visibility
  sort: 'createdAt-desc' | 'createdAt-asc' | 'startDate-desc' | 'startDate-asc'
  creatorId: string
}> = {
  q: { default: '' },
  status: { default: 'all', options: VISIBILITY_OPTIONS },
  sort: {
    default: 'createdAt-desc',
    options: [
      { value: 'createdAt-desc', label: '作成の新しい順' },
      { value: 'createdAt-asc', label: '作成の古い順' },
      { value: 'startDate-desc', label: '開催日の新しい順' },
      { value: 'startDate-asc', label: '開催日の古い順' },
    ],
  },
  creatorId: { default: '' },
}

export const PRE_EVENTS_SPEC: ListSpec<{
  q: string
  status: Visibility
  sort: 'createdAt-desc' | 'createdAt-asc'
  creatorId: string
}> = {
  q: { default: '' },
  status: { default: 'all', options: VISIBILITY_OPTIONS },
  sort: {
    default: 'createdAt-desc',
    options: [
      { value: 'createdAt-desc', label: '作成の新しい順' },
      { value: 'createdAt-asc', label: '作成の古い順' },
    ],
  },
  creatorId: { default: '' },
}

export const USERS_SPEC: ListSpec<{
  view: 'users' | 'banned'
  q: string
  sort: 'lastLoginAt-desc' | 'lastLoginAt-asc' | 'createdAt-desc' | 'createdAt-asc'
}> = {
  view: {
    default: 'users',
    options: [
      { value: 'users', label: 'ユーザー' },
      { value: 'banned', label: 'BAN済み' },
    ],
  },
  q: { default: '' },
  sort: {
    default: 'lastLoginAt-desc',
    options: [
      { value: 'lastLoginAt-desc', label: '最終ログインの新しい順' },
      { value: 'lastLoginAt-asc', label: '最終ログインの古い順' },
      { value: 'createdAt-desc', label: '初回ログインの新しい順' },
      { value: 'createdAt-asc', label: '初回ログインの古い順' },
    ],
  },
}

export const ORGS_SPEC: ListSpec<{
  q: string
  sort: 'createdAt-desc' | 'createdAt-asc' | 'name-asc' | 'name-desc'
  creatorId: string
}> = {
  q: { default: '' },
  sort: {
    default: 'createdAt-desc',
    options: [
      { value: 'createdAt-desc', label: '作成の新しい順' },
      { value: 'createdAt-asc', label: '作成の古い順' },
      { value: 'name-asc', label: '名前の昇順' },
      { value: 'name-desc', label: '名前の降順' },
    ],
  },
  creatorId: { default: '' },
}

/** 管理画面の一覧の1ページの件数。行の一覧なので6の倍数の決まりは及ばない */
export const ADMIN_PER_PAGE = 20
