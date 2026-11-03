import { describe, expect, it } from 'vitest'

import { resolvePlatformRestriction } from './allowed-platforms'
import type { AllowedServer } from '@/lib/allowed-servers'

const base = {
  isAllowedForFediverse: true,
  isAllowedForDiscord: true,
  isAllowedForTwitter: true,
  allowedServers: [] as AllowedServer[],
}

const mastodonServers: AllowedServer[] = [
  { server: 'handon.club', platform: 'mastodon' },
  { server: 'mastodon.social', platform: 'mastodon' },
]

describe('resolvePlatformRestriction', () => {
  it('全プラットフォーム可・サーバー限定なしは何も出さない', () => {
    const r = resolvePlatformRestriction(base)
    expect(r.unrestricted).toBe(true)
    expect(r.showChip).toBe(false)
  })

  it('Fediverse のみなら3実装のロゴを並べる', () => {
    const r = resolvePlatformRestriction({
      ...base,
      isAllowedForDiscord: false,
      isAllowedForTwitter: false,
    })
    expect(r.platforms).toEqual(['mastodon', 'misskey', 'pleroma'])
    expect(r.serverLimited).toBe(false)
    expect(r.showChip).toBe(true)
  })

  it('Fediverse と X なら X のロゴも並ぶ', () => {
    const r = resolvePlatformRestriction({ ...base, isAllowedForDiscord: false })
    expect(r.platforms).toEqual(['mastodon', 'misskey', 'pleroma', 'twitter'])
  })

  it('Discord のみでもロゴを並べる', () => {
    const r = resolvePlatformRestriction({
      ...base,
      isAllowedForFediverse: false,
      isAllowedForTwitter: false,
    })
    expect(r.fediversePlatforms).toEqual([])
    expect(r.platforms).toEqual(['discord'])
  })

  it('許可サーバーが全部 Mastodon なら Mastodon のロゴだけにする', () => {
    const r = resolvePlatformRestriction({
      ...base,
      isAllowedForDiscord: false,
      isAllowedForTwitter: false,
      allowedServers: mastodonServers,
    })
    expect(r.fediversePlatforms).toEqual(['mastodon'])
    expect(r.serverLimited).toBe(true)
    expect(r.serverCount).toBe(2)
    expect(r.serverGroups).toEqual([
      { platform: 'mastodon', servers: ['handon.club', 'mastodon.social'] },
    ])
  })

  it('種別不明のサーバーが混じるなら3実装とも出す', () => {
    const r = resolvePlatformRestriction({
      ...base,
      isAllowedForDiscord: false,
      isAllowedForTwitter: false,
      allowedServers: [...mastodonServers, { server: 'unknown.example', platform: null }],
    })
    expect(r.fediversePlatforms).toEqual(['mastodon', 'misskey', 'pleroma'])
  })

  it('Mastodon 2サーバー ＋ X。サーバー限定は Fediverse にしか掛からない', () => {
    const r = resolvePlatformRestriction({
      ...base,
      isAllowedForDiscord: false,
      allowedServers: mastodonServers,
    })
    expect(r.platforms).toEqual(['mastodon', 'twitter'])
    expect(r.serverCount).toBe(2)
    // サーバー限定は Fediverse にしか掛からない。X は serverGroups に現れない
    expect(r.serverGroups).toEqual([
      { platform: 'mastodon', servers: ['handon.club', 'mastodon.social'] },
    ])
  })

  it('全プラットフォーム可でもサーバー限定があれば制限あつかい', () => {
    const r = resolvePlatformRestriction({ ...base, allowedServers: mastodonServers })
    expect(r.unrestricted).toBe(false)
    expect(r.showChip).toBe(true)
    expect(r.platforms).toEqual(['mastodon', 'discord', 'twitter'])
  })

  it('Fediverse 不可ならサーバー限定は効かない', () => {
    const r = resolvePlatformRestriction({
      ...base,
      isAllowedForFediverse: false,
      allowedServers: mastodonServers,
    })
    expect(r.serverLimited).toBe(false)
    expect(r.serverGroups).toEqual([])
  })
})
