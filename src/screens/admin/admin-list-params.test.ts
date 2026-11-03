import { describe, expect, it } from 'vitest'

import {
  EVENTS_SPEC,
  REPORTS_SPEC,
  USERS_SPEC,
  buildListQuery,
  readListParams,
  splitSort,
} from './admin-list-params'

const read = (query: string, spec = EVENTS_SPEC) => readListParams(new URLSearchParams(query), spec)

describe('readListParams', () => {
  it('何も無ければ既定', () => {
    expect(read('')).toEqual({
      q: '',
      status: 'all',
      sort: 'createdAt-desc',
      creatorId: '',
      page: 1,
    })
  })

  it('選べない値は既定に倒す（手で書き換えられた URL で落ちない）', () => {
    const state = read('status=deleted&sort=title-asc&page=-3')
    expect(state.status).toBe('all')
    expect(state.sort).toBe('createdAt-desc')
    expect(state.page).toBe(1)
  })

  it('自由入力は前後の空白を落として読む', () => {
    expect(read('q=%20%E4%BA%A4%E6%B5%81%20').q).toBe('交流')
  })

  it('通報は開いたときに未処理だけを出す', () => {
    expect(readListParams(new URLSearchParams(''), REPORTS_SPEC).status).toBe('pending')
  })
})

describe('buildListQuery', () => {
  it('既定値は URL に書かない', () => {
    const state = read('')
    expect(buildListQuery(EVENTS_SPEC, state, { status: 'all' })).toBe('')
  })

  it('絞り込みを変えたらページを1に戻す', () => {
    const state = read('status=private&page=3')
    expect(buildListQuery(EVENTS_SPEC, state, { status: 'disabled' })).toBe('?status=disabled')
  })

  it('ページだけ変えるときは絞り込みを残す', () => {
    const state = read('status=private')
    expect(buildListQuery(EVENTS_SPEC, state, { page: 2 })).toBe('?status=private&page=2')
  })

  it('検索語を消すとキーごと消える', () => {
    const state = read('q=abc&creatorId=user_1')
    expect(buildListQuery(EVENTS_SPEC, state, { q: '' })).toBe('?creatorId=user_1')
  })

  it('ユーザーの一覧を切り替えても検索語は残す（同じ人を BAN 済みでも探せる）', () => {
    const state = readListParams(new URLSearchParams('q=alice'), USERS_SPEC)
    expect(buildListQuery(USERS_SPEC, state, { view: 'banned' })).toBe('?view=banned&q=alice')
  })
})

describe('splitSort', () => {
  it('項目と向きに分ける', () => {
    expect(splitSort('startDate-asc')).toEqual({ sortBy: 'startDate', sortOrder: 'asc' })
    expect(splitSort('lastLoginAt-desc')).toEqual({ sortBy: 'lastLoginAt', sortOrder: 'desc' })
  })

  it('並び順の選択肢はどれも API が受ける形になっている', () => {
    for (const spec of [EVENTS_SPEC, USERS_SPEC]) {
      for (const option of spec.sort.options ?? []) {
        expect(option.value).toMatch(/^[a-zA-Z]+-(asc|desc)$/)
      }
    }
  })
})
