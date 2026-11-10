import { describe, expect, it } from 'vitest'

import { hashtagPath } from './hashtags'

describe('hashtagPath', () => {
  it('タグを符号化してタグのページを指す', () => {
    expect(hashtagPath('ゲーム 会')).toBe('/hashtags/%E3%82%B2%E3%83%BC%E3%83%A0%20%E4%BC%9A')
  })

  it('既定の切り替え（upcoming）は URL に書かない', () => {
    expect(hashtagPath('game', 'upcoming')).toBe('/hashtags/game')
  })

  it('ほかの切り替えは scope で渡す', () => {
    expect(hashtagPath('game', 'pre-events')).toBe('/hashtags/game?scope=pre-events')
  })
})
