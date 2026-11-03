import { describe, expect, it } from 'vitest'

import { forgetRememberedServers, readRememberedServer, rememberServer } from './remembered-server'
import { STORAGE_SERVER } from './storage-keys'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

describe('前回ログインしたサーバーの記憶', () => {
  it('覚えたホスト名をプラットフォームごとに読み出せる', () => {
    const storage = memoryStorage()
    rememberServer('mastodon', 'handon.club', storage)
    rememberServer('misskey', 'misskey.io', storage)

    expect(readRememberedServer('mastodon', storage)).toBe('handon.club')
    expect(readRememberedServer('misskey', storage)).toBe('misskey.io')
    expect(readRememberedServer('pleroma', storage)).toBeNull()
  })

  it('同じプラットフォームで覚え直すと、新しいほうになる', () => {
    const storage = memoryStorage()
    rememberServer('mastodon', 'handon.club', storage)
    rememberServer('mastodon', 'mastodon.social', storage)
    expect(readRememberedServer('mastodon', storage)).toBe('mastodon.social')
  })

  it('壊れた値は覚えていないものとして扱い、覚え直せる', () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_SERVER, '{not json')
    expect(readRememberedServer('mastodon', storage)).toBeNull()

    storage.setItem(STORAGE_SERVER, '["handon.club"]')
    expect(readRememberedServer('mastodon', storage)).toBeNull()
    rememberServer('mastodon', 'handon.club', storage)
    expect(readRememberedServer('mastodon', storage)).toBe('handon.club')
  })

  it('忘れると、どのプラットフォームも読み出せない', () => {
    const storage = memoryStorage()
    rememberServer('mastodon', 'handon.club', storage)
    forgetRememberedServers(storage)
    expect(readRememberedServer('mastodon', storage)).toBeNull()
  })

  it('ストレージに触れない環境では何も起きない', () => {
    expect(readRememberedServer('mastodon', null)).toBeNull()
    expect(() => rememberServer('mastodon', 'handon.club', null)).not.toThrow()
    expect(() => forgetRememberedServers(null)).not.toThrow()
  })
})
