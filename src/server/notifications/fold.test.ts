import { describe, expect, it } from 'vitest'

import { foldKeyFor } from '@/server/notifications/fold'
import { KIND_FOLD } from '@/server/notifications/kinds'
import { NOTIFICATION_KINDS } from '@/schemas/notification'

const SEEN = new Date('2026-09-18T12:00:00+09:00')
const LATER = new Date('2026-09-18T15:00:00+09:00')

describe('畳む鍵', () => {
  it('すべての kind に畳み方が決まっている', () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(KIND_FOLD[kind], kind).toBeTruthy()
    }
  })

  /** null はいくつでも作れる（Postgres は NULL どうしを別物として扱う） */
  it('畳まない種別は鍵を持たない', () => {
    expect(foldKeyFor('none', SEEN, 'user_1')).toBeNull()
  })

  it('同じ既読位置なら同じ鍵になる（＝畳まれる）', () => {
    expect(foldKeyFor('target', SEEN, 'user_1')).toBe(foldKeyFor('target', SEEN, 'user_2'))
  })

  /**
   * これが「読んだ後の編集は新しい1件」の実装。
   * 判定を書かずに、鍵が変わることで成り立つ
   */
  it('既読位置が動くと鍵が変わる', () => {
    expect(foldKeyFor('target', SEEN, null)).not.toBe(foldKeyFor('target', LATER, null))
  })

  describe('対象と本人ごとに畳むとき', () => {
    /** まとめると「3人が登録した」のか「1人が3回直した」のか区別できなくなる */
    it('やった人が違えば別の鍵になる', () => {
      expect(foldKeyFor('target+actor', SEEN, 'user_1')).not.toBe(
        foldKeyFor('target+actor', SEEN, 'user_2')
      )
    })

    it('同じ人なら同じ鍵になる', () => {
      expect(foldKeyFor('target+actor', SEEN, 'user_1')).toBe(
        foldKeyFor('target+actor', SEEN, 'user_1')
      )
    })

    it('既読位置が動けば、同じ人でも鍵が変わる', () => {
      expect(foldKeyFor('target+actor', SEEN, 'user_1')).not.toBe(
        foldKeyFor('target+actor', LATER, 'user_1')
      )
    })
  })
})
