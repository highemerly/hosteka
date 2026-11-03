import { describe, expect, it } from 'vitest'

import { buildDefaultBody, buildMentions, reachableUsers, type ContactUser } from './mentions'

const user = (over: Partial<ContactUser> = {}): ContactUser => ({
  id: 'u1',
  username: 'alice',
  displayName: 'Alice',
  avatar: null,
  server: 'mastodon.social',
  platform: 'mastodon',
  ...over,
})

const twitterUser = user({ id: 'u2', username: 'bob', server: 'x.com', platform: 'twitter' })

describe('reachableUsers', () => {
  it('X へ投稿するときは X の人だけ。1つの投稿は両方に届かない', () => {
    expect(reachableUsers([user(), twitterUser], 'twitter')).toEqual([twitterUser])
  })

  it('Fediverse へ投稿するときは Fediverse の人だけ', () => {
    expect(reachableUsers([user(), twitterUser], 'fediverse')).toEqual([user()])
  })

  it('プラットフォーム欄が古くても、サーバーが x.com なら X の人として扱う', () => {
    const legacy = user({ id: 'u3', server: 'x.com', platform: '' })
    expect(reachableUsers([legacy], 'twitter')).toEqual([legacy])
  })
})

describe('buildMentions', () => {
  it('別サーバーの相手は @user@server まで書く', () => {
    expect(buildMentions([user()], { network: 'fediverse' })).toEqual(['@alice@mastodon.social'])
  })

  it('同じサーバーの相手は縮める。メンションが本文より長くなるのを防ぐ', () => {
    expect(
      buildMentions([user()], { network: 'fediverse', abbreviateOnServer: 'mastodon.social' })
    ).toEqual(['@alice'])
  })

  it('X はサーバーを付けない', () => {
    expect(buildMentions([twitterUser], { network: 'twitter' })).toEqual(['@bob'])
  })
})

describe('buildDefaultBody', () => {
  it('用件と URL を並べる。宛名は投稿先ごとに付けるので入れない', () => {
    expect(
      buildDefaultBody({
        title: '忘年会の日程',
        url: 'https://hosteka.example/pre-events/x',
      })
    ).toBe('忘年会の日程のお知らせです。\n\nhttps://hosteka.example/pre-events/x')
  })
})
