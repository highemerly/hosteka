import { describe, it, expect } from 'vitest'

import { explainIneligibility, isPlatformAllowed } from './participation-utils'

const base = {
  isAllowedForDiscord: true,
  isAllowedForFediverse: true,
  allowedFediverseServers: null as string | null,
}

describe('isPlatformAllowed', () => {
  it('Discord ユーザーは isAllowedForDiscord に従う', () => {
    expect(isPlatformAllowed({ ...base }, 'discord', undefined)).toBe(true)
    expect(
      isPlatformAllowed({ ...base, isAllowedForDiscord: false }, 'discord', undefined)
    ).toBe(false)
  })

  it('Fediverse ユーザーは isAllowedForFediverse に従う', () => {
    expect(isPlatformAllowed({ ...base }, 'mastodon', 'a.example')).toBe(true)
    expect(
      isPlatformAllowed({ ...base, isAllowedForFediverse: false }, 'mastodon', 'a.example')
    ).toBe(false)
  })

  it('サーバー制限がある場合は所属サーバーで判定する', () => {
    const target = { ...base, allowedFediverseServers: JSON.stringify(['a.example']) }
    expect(isPlatformAllowed(target, 'mastodon', 'a.example')).toBe(true)
    expect(isPlatformAllowed(target, 'mastodon', 'b.example')).toBe(false)
    expect(isPlatformAllowed(target, 'mastodon', undefined)).toBe(false)
  })

  it('空のサーバー制限は「制限なし」として扱う', () => {
    const target = { ...base, allowedFediverseServers: JSON.stringify([]) }
    expect(isPlatformAllowed(target, 'mastodon', 'b.example')).toBe(true)
  })

  // 壊れたJSONで参加不能になると、原因が分からないまま締め出される。
  // 従来の挙動どおり「制限なし」に倒す。
  it('壊れたJSONは制限なしとして扱う', () => {
    const target = { ...base, allowedFediverseServers: '{invalid' }
    expect(isPlatformAllowed(target, 'mastodon', 'b.example')).toBe(true)
  })

  it('Discord 制限はサーバー制限の影響を受けない', () => {
    const target = { ...base, allowedFediverseServers: JSON.stringify(['a.example']) }
    expect(isPlatformAllowed(target, 'discord', undefined)).toBe(true)
  })
})

describe('explainIneligibility', () => {
  const fediverseOnly = {
    isAllowedForFediverse: true,
    isAllowedForDiscord: false,
    isAllowedForTwitter: false,
    allowedFediverseServers: null,
  }
  const serverLimited = {
    ...fediverseOnly,
    allowedFediverseServers: JSON.stringify(['handon.club']),
  }

  it('参加できるなら null', () => {
    expect(explainIneligibility('mastodon', 'handon.club', fediverseOnly)).toBeNull()
  })

  it('プラットフォームが許可されていない', () => {
    expect(explainIneligibility('discord', undefined, fediverseOnly)).toBe('platform')
    expect(explainIneligibility('twitter', undefined, fediverseOnly)).toBe('platform')
  })

  it('Fediverse は許可だが、サーバーが対象外', () => {
    expect(explainIneligibility('mastodon', 'mastodon.social', serverLimited)).toBe('server')
  })

  it('サーバー限定があってもプラットフォーム違いは platform', () => {
    expect(explainIneligibility('discord', undefined, serverLimited)).toBe('platform')
  })

  it('未ログイン（プラットフォーム不明）は platform', () => {
    expect(explainIneligibility(undefined, undefined, fediverseOnly)).toBe('platform')
  })
})
