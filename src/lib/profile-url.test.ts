import { describe, expect, it } from 'vitest'

import { profileUrl } from './profile-url'

describe('profileUrl', () => {
  it('Fediverse はサーバーの /@ユーザー名', () => {
    expect(profileUrl({ platform: 'mastodon', username: 'alice', server: 'example.social' })).toBe(
      'https://example.social/@alice'
    )
    expect(profileUrl({ platform: 'misskey', username: 'bob', server: 'misskey.io' })).toBe(
      'https://misskey.io/@bob'
    )
  })

  it('X は /@ の形では開けないので x.com/ユーザー名', () => {
    expect(profileUrl({ platform: 'twitter', username: 'carol', server: 'x.com' })).toBe(
      'https://x.com/carol'
    )
  })

  it('Discord は開ける URL が無いので null', () => {
    expect(profileUrl({ platform: 'discord', username: 'dave', server: 'discord.com' })).toBeNull()
  })
})
