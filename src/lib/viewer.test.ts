import { describe, expect, it } from 'vitest'

import { isFediverseViewer, parseViewerCookie, readCookie, type Viewer } from './viewer'

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')

const VIEWER: Viewer = {
  id: 'user_1',
  name: 'テスト太郎',
  avatar: null,
  isAdmin: false,
  username: 'taro',
  server: 'handon.club',
  platform: 'mastodon',
  v: 1,
}

describe('parseViewerCookie', () => {
  it('正しい値を読む', () => {
    expect(parseViewerCookie(encode(VIEWER))).toEqual(VIEWER)
  })

  it('マルチバイトの名前が壊れない', () => {
    const v = { ...VIEWER, name: '🎉 はん＠日本語' }
    expect(parseViewerCookie(encode(v))?.name).toBe('🎉 はん＠日本語')
  })

  it('未設定は null', () => {
    expect(parseViewerCookie(undefined)).toBeNull()
    expect(parseViewerCookie('')).toBeNull()
  })

  it('壊れた値は null。閲覧者が書き換えられる前提で扱う', () => {
    expect(parseViewerCookie('!!!not-base64!!!')).toBeNull()
    expect(parseViewerCookie(Buffer.from('{{', 'utf8').toString('base64url'))).toBeNull()
  })

  it('バージョンが違えば無視する', () => {
    expect(parseViewerCookie(encode({ ...VIEWER, v: 2 }))).toBeNull()
  })

  it('id や name が欠けていれば null', () => {
    expect(parseViewerCookie(encode({ ...VIEWER, id: '' }))).toBeNull()
    expect(parseViewerCookie(encode({ ...VIEWER, name: undefined }))).toBeNull()
  })
})

describe('isFediverseViewer', () => {
  it('Fediverse 系だけ true', () => {
    expect(isFediverseViewer({ ...VIEWER, platform: 'misskey' })).toBe(true)
    expect(isFediverseViewer({ ...VIEWER, platform: 'discord' })).toBe(false)
    expect(isFediverseViewer(null)).toBe(false)
  })
})

describe('readCookie', () => {
  it('名前が前方一致する別のCookieを拾わない', () => {
    expect(readCookie('ht-viewer', 'ht-viewer_old=x; ht-viewer=abc')).toBe('abc')
  })

  it('無ければ undefined', () => {
    expect(readCookie('ht-viewer', 'other=1')).toBeUndefined()
    expect(readCookie('ht-viewer', '')).toBeUndefined()
  })
})
