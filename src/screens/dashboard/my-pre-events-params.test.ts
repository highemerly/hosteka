import { describe, expect, it } from 'vitest'

import {
  buildMyPreEventsQuery,
  DEFAULT_FILTERS,
  readMyPreEventsFilters,
  type MyPreEventsFilters,
} from './my-pre-events-params'

const read = (query: string) => readMyPreEventsFilters(new URLSearchParams(query))

describe('readMyPreEventsFilters', () => {
  it('パラメータが無ければ既定に倒す', () => {
    expect(read('')).toEqual(DEFAULT_FILTERS)
  })

  it('指定された絞り込みを読む', () => {
    expect(read('role=created&scope=past&page=3')).toEqual({
      role: 'created',
      scope: 'past',
      page: 3,
    })
  })

  it('旧画面の ?default= も受ける。貼られたURLは残る', () => {
    expect(read('default=created').role).toBe('created')
    expect(read('default=participating').role).toBe('participating')
    // 新しい形が書いてあればそちらが勝つ
    expect(read('default=created&role=participating').role).toBe('participating')
  })

  it('知らない値は既定に倒す。URLは手で書き換えられる', () => {
    expect(read('role=admin&scope=someday')).toMatchObject({
      role: 'all',
      scope: 'upcoming',
    })
  })

  it('ページ番号が数値でない・0以下でも1ページ目にする', () => {
    expect(read('page=0').page).toBe(1)
    expect(read('page=-2').page).toBe(1)
    expect(read('page=abc').page).toBe(1)
  })
})

describe('buildMyPreEventsQuery', () => {
  const current: MyPreEventsFilters = { ...DEFAULT_FILTERS }

  it('既定値はURLに書かない', () => {
    expect(buildMyPreEventsQuery(current, { role: 'all' })).toBe('')
  })

  it('選んだものだけを書く', () => {
    expect(buildMyPreEventsQuery(current, { role: 'created' })).toBe('?role=created')
    expect(buildMyPreEventsQuery(current, { scope: 'past' })).toBe('?scope=past')
  })

  it('絞り込みを変えたらページを1に戻す', () => {
    const onPage3: MyPreEventsFilters = { ...current, page: 3 }
    expect(buildMyPreEventsQuery(onPage3, { scope: 'past' })).toBe('?scope=past')
  })

  it('ページ送りは絞り込みを保ったまま進む', () => {
    const filtered: MyPreEventsFilters = { ...current, role: 'participating' }
    expect(buildMyPreEventsQuery(filtered, { page: 2 })).toBe('?role=participating&page=2')
  })

  it('1ページ目に戻るとページ番号は消える', () => {
    const onPage2: MyPreEventsFilters = { ...current, page: 2 }
    expect(buildMyPreEventsQuery(onPage2, { page: 1 })).toBe('')
  })

  // **旧パラメータは書き戻さない。** 読めるが、新しく作るURLには出さない
  it('組み立てたURLに ?default= は現れない', () => {
    expect(buildMyPreEventsQuery({ ...current, role: 'created' }, { page: 2 })).toBe(
      '?role=created&page=2'
    )
  })
})
