import { describe, expect, it } from 'vitest'

import {
  PLATFORMS,
  findPlatform,
  isValidServerHost,
  normalizeServerHost,
} from './sign-in-platforms'

describe('ホスト名の整形', () => {
  it('URL ごと貼られても受け取る', () => {
    expect(normalizeServerHost('https://misskey.io/')).toBe('misskey.io')
    expect(normalizeServerHost('http://handon.club')).toBe('handon.club')
    expect(normalizeServerHost('  mastodon.social  ')).toBe('mastodon.social')
  })

  it('プロフィールの URL を貼られても、ホスト名だけ取り出す', () => {
    expect(normalizeServerHost('https://fedibird.com/@taro')).toBe('fedibird.com')
  })

  it('整形した形はサーバー側の検証を通る', () => {
    expect(isValidServerHost(normalizeServerHost('https://misskey.io/'))).toBe(true)
  })

  it('ホスト名になっていないものは弾く', () => {
    expect(isValidServerHost('')).toBe(false)
    expect(isValidServerHost('localhost')).toBe(false)
    expect(isValidServerHost('日本語.com')).toBe(false)
  })
})

describe('プラットフォームの表', () => {
  it('URL パラメータから引ける。知らない値は引けない', () => {
    expect(findPlatform('mastodon')?.label).toBe('Mastodon')
    expect(findPlatform('facebook')).toBeUndefined()
    expect(findPlatform(null)).toBeUndefined()
  })

  it('ホスト名が要るものは、入力例を持っている', () => {
    for (const p of PLATFORMS.filter((p) => p.needsServer)) {
      expect(p.placeholder, p.label).toBeTruthy()
    }
  })

  /**
   * **画面のトグルと、サーバーが要求するスコープを一致させる。**
   * Pleroma の register ルートは `read:accounts` 固定なので、ここを true に
   * すると「渡したのに渡っていない」状態を作る。
   */
  it('投稿の権限を頼めるのは、サーバー側が広いスコープを要求するものだけ', () => {
    expect(PLATFORMS.filter((p) => p.canRequestWrite).map((p) => p.value)).toEqual([
      'mastodon',
      'misskey',
    ])
  })
})
