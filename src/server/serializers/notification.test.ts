import { describe, expect, it } from 'vitest'

import { serializeNotification } from './notification'

const SEEN = new Date('2026-09-18T12:00:00+09:00')

const ACTOR = {
  id: 'user_1',
  username: 'taro',
  displayName: 'テスト太郎',
  avatar: null,
  server: 'example.social',
  platform: 'mastodon',
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ntf_1',
    kind: 'event_updated',
    targetType: 'event',
    targetId: 'evt_1',
    payload: JSON.stringify({ title: '花見の会', changed: ['日時'] }),
    occurredAt: new Date('2026-09-18T15:00:00+09:00'),
    repeatCount: 1,
    actor: ACTOR,
    ...overrides,
  } as Parameters<typeof serializeNotification>[0]
}

describe('通知のDTO', () => {
  it('分類を kind から導いて載せる', () => {
    expect(serializeNotification(row(), SEEN).category).toBe('participant')
    expect(serializeNotification(row({ kind: 'participation_requested' }), SEEN).category).toBe(
      'organizer'
    )
  })

  /** 画面が自分で既読位置と比べると、未読数と食い違う */
  it('未読かどうかをサーバー側で決めて載せる', () => {
    expect(serializeNotification(row(), SEEN).unread).toBe(true)
    expect(
      serializeNotification(row({ occurredAt: new Date('2026-09-18T09:00:00+09:00') }), SEEN).unread
    ).toBe(false)
  })

  it('日時は ISO 文字列で返す', () => {
    expect(serializeNotification(row(), SEEN).occurredAt).toBe('2026-09-18T06:00:00.000Z')
  })

  describe('導線', () => {
    it('イベントと日程調整は id で開く', () => {
      expect(serializeNotification(row(), SEEN).href).toBe('/events/evt_1')
      expect(
        serializeNotification(
          row({ kind: 'pre_event_updated', targetType: 'pre_event', targetId: 'pre_1' }),
          SEEN
        ).href
      ).toBe('/pre-events/pre_1')
    })

    /** グループは slug で開く。id を保存してあるのは slug が編集で変わるため */
    it('グループは写しておいた slug で開く', () => {
      expect(
        serializeNotification(
          row({
            kind: 'org_admin_added',
            targetType: 'org',
            targetId: 'org_1',
            payload: JSON.stringify({ title: 'さくら会', orgSlug: 'sakura' }),
          }),
          SEEN
        ).href
      ).toBe('/orgs/sakura')
    })

    /** 取り消し済みのものは辿る先が無い */
    it('取り消された日程調整にはリンクを張らない', () => {
      expect(
        serializeNotification(
          row({ kind: 'pre_event_deleted', targetType: 'pre_event' }),
          SEEN
        ).href
      ).toBeNull()
    })
  })

  describe('欠けている値', () => {
    it('退会した人の操作は actor が null になる', () => {
      expect(serializeNotification(row({ actor: null }), SEEN).actor).toBeNull()
    })

    /** 表示するだけのものなので、1行読めないことでページを落とさない */
    it('payload が壊れていても投げない', () => {
      expect(serializeNotification(row({ payload: '{壊れている' }), SEEN).payload).toEqual({})
    })

    it('slug の写しが無いグループにはリンクを張らない', () => {
      expect(
        serializeNotification(
          row({ kind: 'org_admin_added', targetType: 'org', payload: null }),
          SEEN
        ).href
      ).toBeNull()
    })
  })

  /** 機密が DTO に混ざらないこと（accessToken などは serializeUser が落とす） */
  it('actor は公開してよい6項目だけ', () => {
    const actor = serializeNotification(row(), SEEN).actor
    expect(Object.keys(actor ?? {}).sort()).toEqual([
      'avatar',
      'displayName',
      'id',
      'platform',
      'server',
      'username',
    ])
  })
})
