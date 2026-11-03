import { describe, expect, it } from 'vitest'

import {
  buildMyEventsQuery,
  DEFAULT_FILTERS,
  readMyEventsFilters,
  type MyEventsFilters,
} from './my-events-params'

const read = (query: string) => readMyEventsFilters(new URLSearchParams(query))

describe('readMyEventsFilters', () => {
  it('パラメータが無ければ既定に倒す', () => {
    expect(read('')).toEqual(DEFAULT_FILTERS)
  })

  it('指定された絞り込みを読む', () => {
    expect(read('role=created&scope=past&page=3')).toEqual({
      role: 'created',
      scope: 'past',
      status: 'all',
      page: 3,
    })
  })

  it('知らない値は既定に倒す。URLは手で書き換えられる', () => {
    expect(read('role=admin&scope=someday&status=going')).toMatchObject({
      role: 'all',
      scope: 'upcoming',
      status: 'all',
    })
  })

  it('ページ番号が数値でない・0以下でも1ページ目にする', () => {
    expect(read('page=0').page).toBe(1)
    expect(read('page=-2').page).toBe(1)
    expect(read('page=abc').page).toBe(1)
  })
})

describe('buildMyEventsQuery', () => {
  const current: MyEventsFilters = { ...DEFAULT_FILTERS }

  it('既定値はURLに書かない', () => {
    expect(buildMyEventsQuery(current, { role: 'all' })).toBe('')
  })

  it('選んだものだけを書く', () => {
    expect(buildMyEventsQuery(current, { role: 'created' })).toBe('?role=created')
    expect(buildMyEventsQuery(current, { status: 'maybe' })).toBe('?status=maybe')
  })

  it('絞り込みを変えたらページを1に戻す', () => {
    const onPage3: MyEventsFilters = { ...current, page: 3 }
    expect(buildMyEventsQuery(onPage3, { scope: 'past' })).toBe('?scope=past')
  })

  it('ページ送りは絞り込みを保ったまま進む', () => {
    const filtered: MyEventsFilters = { ...current, role: 'participating', status: 'maybe' }
    expect(buildMyEventsQuery(filtered, { page: 2 })).toBe(
      '?role=participating&status=maybe&page=2'
    )
  })

  it('1ページ目に戻るとページ番号は消える', () => {
    const onPage2: MyEventsFilters = { ...current, page: 2 }
    expect(buildMyEventsQuery(onPage2, { page: 1 })).toBe('')
  })
})
