import { describe, expect, it } from 'vitest'

import {
  KIND_CATEGORY,
  KINDS_BY_CATEGORY,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_KINDS,
  listNotificationsQuery,
} from '@/schemas/notification'

describe('通知の分類', () => {
  it('すべての kind がちょうど1つの分類に入る', () => {
    const listed = NOTIFICATION_CATEGORIES.flatMap((c) => KINDS_BY_CATEGORY[c])
    expect([...listed].sort()).toEqual([...NOTIFICATION_KINDS].sort())
    expect(new Set(listed).size).toBe(NOTIFICATION_KINDS.length)
  })

  it('分類ごとの一覧が KIND_CATEGORY と一致する', () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      for (const kind of KINDS_BY_CATEGORY[category]) {
        expect(KIND_CATEGORY[kind], kind).toBe(category)
      }
    }
  })

  /** 幹事が「参加リクエスト」だけを追えるようにするのが、この機能の中心 */
  it('参加リクエストは主催の分類に入る', () => {
    expect(KIND_CATEGORY.participation_requested).toBe('organizer')
  })
})

describe('通知一覧の絞り込み', () => {
  it('何も指定しなければ全件・1ページ目', () => {
    expect(listNotificationsQuery.parse({})).toEqual({ category: 'all', page: 1, perPage: 20 })
  })

  it('分類と種別を両方受ける', () => {
    expect(
      listNotificationsQuery.parse({ category: 'organizer', kind: 'participation_requested' })
    ).toMatchObject({ category: 'organizer', kind: 'participation_requested' })
  })

  it('知らない種別は弾く', () => {
    expect(listNotificationsQuery.safeParse({ kind: 'あやしい' }).success).toBe(false)
    expect(listNotificationsQuery.safeParse({ category: 'あやしい' }).success).toBe(false)
  })
})
