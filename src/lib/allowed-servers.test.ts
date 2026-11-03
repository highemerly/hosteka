import { describe, expect, it } from 'vitest'

import { distinctPlatforms, groupByPlatform, parseAllowedServers } from './allowed-servers'

describe('parseAllowedServers', () => {
  it('旧形式（文字列配列）は種別不明として読む', () => {
    expect(parseAllowedServers('["handon.club","mastodon.social"]')).toEqual([
      { server: 'handon.club', platform: null },
      { server: 'mastodon.social', platform: null },
    ])
  })

  it('新形式は保存済みの種別を使う', () => {
    expect(
      parseAllowedServers(
        '[{"server":"handon.club","type":"mastodon"},{"server":"misskey.io","type":"misskey"}]'
      )
    ).toEqual([
      { server: 'handon.club', platform: 'mastodon' },
      { server: 'misskey.io', platform: 'misskey' },
    ])
  })

  it('派生実装は本家に寄せる', () => {
    expect(parseAllowedServers('[{"server":"fedibird.com","type":"fedibird"}]')).toEqual([
      { server: 'fedibird.com', platform: 'mastodon' },
    ])
    expect(parseAllowedServers('[{"server":"s.example","type":"sharkey"}]')).toEqual([
      { server: 's.example', platform: 'misskey' },
    ])
    expect(parseAllowedServers('[{"server":"a.example","type":"akkoma"}]')).toEqual([
      { server: 'a.example', platform: 'pleroma' },
    ])
  })

  it('未知の実装は種別不明にする', () => {
    expect(parseAllowedServers('[{"server":"x.example","type":"gotosocial"}]')).toEqual([
      { server: 'x.example', platform: null },
    ])
  })

  it('null・壊れた JSON・配列でない値は空', () => {
    expect(parseAllowedServers(null)).toEqual([])
    expect(parseAllowedServers('{{')).toEqual([])
    expect(parseAllowedServers('{"server":"a.example"}')).toEqual([])
  })
})

describe('distinctPlatforms', () => {
  it('Mastodon だけなら Mastodon だけを返す', () => {
    expect(
      distinctPlatforms([
        { server: 'handon.club', platform: 'mastodon' },
        { server: 'mastodon.social', platform: 'mastodon' },
      ])
    ).toEqual(['mastodon'])
  })

  it('表示順は mastodon → misskey → pleroma に固定する', () => {
    expect(
      distinctPlatforms([
        { server: 'p.example', platform: 'pleroma' },
        { server: 'misskey.io', platform: 'misskey' },
      ])
    ).toEqual(['misskey', 'pleroma'])
  })

  it('1つでも種別不明があれば絞り込まない', () => {
    expect(
      distinctPlatforms([
        { server: 'handon.club', platform: 'mastodon' },
        { server: 'unknown.example', platform: null },
      ])
    ).toBeNull()
  })

  it('空なら null', () => {
    expect(distinctPlatforms([])).toBeNull()
  })
})

describe('groupByPlatform', () => {
  it('プラットフォームごとにまとめ、不明は最後に残す', () => {
    expect(
      groupByPlatform([
        { server: 'misskey.io', platform: 'misskey' },
        { server: 'handon.club', platform: 'mastodon' },
        { server: 'unknown.example', platform: null },
        { server: 'mastodon.social', platform: 'mastodon' },
      ])
    ).toEqual([
      { platform: 'mastodon', servers: ['handon.club', 'mastodon.social'] },
      { platform: 'misskey', servers: ['misskey.io'] },
      { platform: null, servers: ['unknown.example'] },
    ])
  })
})
