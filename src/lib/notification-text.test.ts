import { describe, expect, it } from 'vitest'

import {
  KIND_LABEL_JA,
  notificationText,
  parseNotificationPayload,
  type NotificationTextInput,
} from '@/lib/notification-text'
import { KIND_CATEGORY, NOTIFICATION_KINDS } from '@/schemas/notification'

function input(overrides: Partial<NotificationTextInput> = {}): NotificationTextInput {
  return {
    kind: 'event_updated',
    actor: { displayName: 'たろう' },
    payload: { title: '花見の会' },
    repeatCount: 1,
    ...overrides,
  }
}

describe('通知の文言', () => {
  it('すべての kind が空でない文を返す', () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(notificationText(input({ kind })), kind).not.toBe('')
    }
  })

  it('すべての kind にバッジのラベルと分類がある', () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(KIND_LABEL_JA[kind], kind).toBeTruthy()
      expect(KIND_CATEGORY[kind], kind).toBeTruthy()
    }
  })

  it('対象の名前を『』で囲んで出す', () => {
    expect(notificationText(input({ kind: 'event_cancelled' }))).toBe('『花見の会』が中止になりました')
  })

  /**
   * 対象が消えても行は残る。名前の写しが無いときに『』だけが残ると
   * 壊れて見えるので、総称に落とす
   */
  it('名前の写しが無ければ総称で通す', () => {
    expect(notificationText(input({ kind: 'event_cancelled', payload: {} }))).toBe(
      'イベントが中止になりました'
    )
    expect(notificationText(input({ kind: 'pre_event_deleted', payload: {} }))).toBe(
      '日程調整が取り消されました'
    )
  })

  /**
   * 日程調整がイベントになった。自動で登録された人には、登録されたことまで言う
   * （言わないと、自分で登録しに行って「登録済み」を見ることになる）
   */
  it('日程が決まった知らせは、自動で登録されたかで文が変わる', () => {
    expect(
      notificationText(input({ kind: 'pre_event_promoted', payload: { title: '忘年会', registered: true } }))
    ).toBe('『忘年会』の日程が決まり、参加で登録されました')
    expect(notificationText(input({ kind: 'pre_event_promoted', payload: { title: '忘年会' } }))).toBe(
      '『忘年会』の日程が決まりました'
    )
  })

  it('退会した人の操作でも壊れない', () => {
    expect(notificationText(input({ kind: 'participation_requested', actor: null }))).toBe(
      '退会した利用者が『花見の会』に参加リクエストを出しました'
    )
  })

  it('変わった項目を「・」で繋ぐ', () => {
    expect(
      notificationText(input({ payload: { title: '花見の会', changed: ['日時', '場所'] } }))
    ).toBe('『花見の会』の日時・場所が変わりました')
  })

  it('変わった項目が分からなければ「内容」にする', () => {
    expect(notificationText(input({ payload: { title: '花見の会', changed: [] } }))).toBe(
      '『花見の会』の内容が変わりました'
    )
  })

  describe('畳まれた通知', () => {
    /** 畳んだら人名を出さない。名前の配列を持たずに済ませるため */
    it('日程調整の回答は件数だけを言い、人名を出さない', () => {
      const text = notificationText(
        input({ kind: 'pre_event_answered', payload: { title: '歓迎会の日程' }, repeatCount: 3 })
      )
      expect(text).toBe('『歓迎会の日程』に回答が3件届きました')
      expect(text).not.toContain('たろう')
    })

    it('1件なら誰が回答したかを言う', () => {
      expect(
        notificationText(
          input({ kind: 'pre_event_answered', payload: { title: '歓迎会の日程' } })
        )
      ).toBe('たろうさんが『歓迎会の日程』に回答しました')
    })

    /** 同じ人が出したり直したりを1行にまとめるので、状態を言い切らない */
    it('参加登録は2回目以降「参加内容を変えた」になる', () => {
      expect(
        notificationText(
          input({
            kind: 'participation_registered',
            payload: { title: '花見の会', status: 'maybe' },
            repeatCount: 2,
          })
        )
      ).toBe('たろうさんが『花見の会』の参加内容を変えました')
    })

    it('1件なら選んだ状態まで言う', () => {
      expect(
        notificationText(
          input({
            kind: 'participation_registered',
            payload: { title: '花見の会', status: 'maybe' },
          })
        )
      ).toBe('たろうさんが『花見の会』に未定で登録しました')
    })
  })

  /**
   * 参加リクエストの見送りは2通りある。受け付けをやめただけのときに
   * 「見送られました」と出すと、本人の回答が判断されたように読める
   */
  it('受け付けをやめた場合は、見送られたと言わない', () => {
    expect(
      notificationText(
        input({ kind: 'participation_rejected', payload: { title: '花見の会', reason: 'closed' } })
      )
    ).toBe('『花見の会』が参加リクエストの受け付けをやめました')

    expect(
      notificationText(input({ kind: 'participation_rejected', payload: { title: '花見の会' } }))
    ).toBe('『花見の会』への参加リクエストは見送られました')
  })
})

describe('payload の読み取り', () => {
  it('中身を返す', () => {
    expect(parseNotificationPayload('{"title":"花見の会"}')).toEqual({ title: '花見の会' })
  })

  /** 表示するだけのものなので、1行読めないことでページを落とさない */
  it('壊れていても投げずに空を返す', () => {
    expect(parseNotificationPayload('{壊れている')).toEqual({})
    expect(parseNotificationPayload('null')).toEqual({})
    expect(parseNotificationPayload('[1,2]')).toEqual({})
    expect(parseNotificationPayload('"文字列"')).toEqual({})
    expect(parseNotificationPayload(null)).toEqual({})
    expect(parseNotificationPayload(undefined)).toEqual({})
  })
})
