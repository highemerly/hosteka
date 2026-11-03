import { describe, expect, it } from 'vitest'

import {
  buildExternalUrl,
  destinationName,
  planPosts,
  postDestinations,
  type PostDestination,
} from './destinations'
import type { ContactUser } from './mentions'
import type { ContactViewer } from './post-method'

const viewer = (over: Partial<ContactViewer> = {}): ContactViewer => ({
  platform: 'mastodon',
  server: 'handon.club',
  mayPostDirectly: true,
  canPostDirectly: true,
  ...over,
})

const user = (over: Partial<ContactUser> = {}): ContactUser => ({
  id: 'u1',
  username: 'alice',
  displayName: 'Alice',
  avatar: null,
  server: 'handon.club',
  platform: 'mastodon',
  ...over,
})

const remote = user({ id: 'u2', username: 'carol', server: 'mstdn.example' })
const xUser = user({ id: 'u3', username: 'bob', server: 'x.com', platform: 'twitter' })

const summary = (destinations: PostDestination[]) =>
  destinations.map((d) => [d.network, d.server, d.users.map((u) => u.id)])

describe('postDestinations', () => {
  it('直接投稿は自分のアカウントからの1つだけ。Xの人は外れる', () => {
    expect(
      summary(
        postDestinations({
          method: 'direct',
          viewer: viewer(),
          users: [user(), xUser],
          fromServer: 'ignored.example',
        })
      )
    ).toEqual([['fediverse', 'handon.club', ['u1']]])
  })

  it('投稿画面へ移動するときは、宛先がいるネットワークの数だけ出す', () => {
    expect(
      summary(
        postDestinations({
          method: 'external',
          viewer: viewer(),
          users: [user(), remote, xUser],
          fromServer: 'handon.club',
        })
      )
    ).toEqual([
      ['fediverse', 'handon.club', ['u1', 'u2']],
      ['twitter', 'x.com', ['u3']],
    ])
  })

  it('宛先がXの人だけなら、Fediverse の投稿先は出さない', () => {
    expect(
      summary(
        postDestinations({
          method: 'external',
          viewer: viewer(),
          users: [xUser],
          fromServer: 'handon.club',
        })
      )
    ).toEqual([['twitter', 'x.com', ['u3']]])
  })

  it('投稿元サーバーは入力された値を使う。自分のサーバーに決め打ちしない', () => {
    const [destination] = postDestinations({
      method: 'external',
      viewer: viewer(),
      users: [user()],
      fromServer: 'mstdn.example',
    })
    expect(destination.server).toBe('mstdn.example')
  })

  it('投稿元サーバーが空なら決めない。投稿画面に選ばせる', () => {
    const [destination] = postDestinations({
      method: 'external',
      viewer: viewer(),
      users: [user()],
      fromServer: '',
    })
    expect(destination.server).toBeNull()
  })

  it('Fediverse で入っていない人の投稿元は決めない', () => {
    expect(
      summary(
        postDestinations({
          method: 'external',
          viewer: viewer({ platform: 'twitter', server: 'x.com', canPostDirectly: false }),
          users: [user(), xUser],
          fromServer: '',
        })
      )
      // 自分の居場所（x.com）を先に出す
    ).toEqual([
      ['twitter', 'x.com', ['u3']],
      ['fediverse', null, ['u1']],
    ])
  })

  it('宛先が空でも必ず1つは残す。これから答えてほしい人に声をかけられる', () => {
    const none = (v: ContactViewer, fromServer: string) =>
      summary(postDestinations({ method: 'external', viewer: v, users: [], fromServer }))

    expect(none(viewer(), 'handon.club')).toEqual([['fediverse', 'handon.club', []]])
    expect(none(viewer({ platform: 'twitter', server: 'x.com' }), '')).toEqual([
      ['twitter', 'x.com', []],
    ])
    expect(none(viewer({ platform: 'discord', server: 'discord.com' }), '')).toEqual([
      ['fediverse', null, []],
    ])
  })

  it('文字数の上限は投稿元で決まる。自分のサーバー以外は狭い側に倒す', () => {
    const limitOf = (fromServer: string) =>
      postDestinations({
        method: 'external',
        viewer: viewer({ platform: 'misskey', server: 'misskey.example' }),
        users: [user(), xUser],
        fromServer,
      }).map((d) => d.limit)

    expect(limitOf('misskey.example')).toEqual([3000, 280])
    expect(limitOf('handon.club')).toEqual([500, 280])
  })
})

describe('destinationName', () => {
  it('投稿元が決まらないときはサーバー名を出せない', () => {
    expect(destinationName({ network: 'fediverse', server: null, users: [], limit: 500 })).toBe(
      'Fediverse サーバー'
    )
  })
})

describe('planPosts', () => {
  const plan = (fromServer: string, abbreviate: boolean) =>
    planPosts(
      postDestinations({
        method: 'external',
        viewer: viewer(),
        users: [user(), remote, xUser],
        fromServer,
      }),
      '  集合は18時です  ',
      abbreviate
    )

  it('同じ本文に、投稿先ごとの宛名を付ける', () => {
    expect(plan('handon.club', false).map((p) => p.posts.map((post) => post.fullText))).toEqual([
      ['@alice@handon.club @carol@mstdn.example\n\n集合は18時です'],
      ['@bob\n\n集合は18時です'],
    ])
  })

  it('縮める基準は投稿元のサーバー。書き換えたら縮む相手も変わる', () => {
    expect(plan('handon.club', true)[0].posts[0].fullText).toBe(
      '@alice @carol@mstdn.example\n\n集合は18時です'
    )
    expect(plan('mstdn.example', true)[0].posts[0].fullText).toBe(
      '@alice@handon.club @carol\n\n集合は18時です'
    )
  })

  it('投稿元が決まらないときは縮めない', () => {
    expect(plan('', true)[0].posts[0].fullText).toBe(
      '@alice@handon.club @carol@mstdn.example\n\n集合は18時です'
    )
  })

  it('文字数は宛名を含めて数える', () => {
    const [fediverse, twitter] = plan('handon.club', false)
    expect(fediverse.length).toBe(fediverse.posts[0].fullText.length)
    expect(twitter.length).toBe('@bob\n\n集合は18時です'.length)
  })

  it('収まらなければ投稿先ごとに分ける。Xは上限が狭いので先に分かれる', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      user({ id: `x${i}`, username: `twitter_user_${i}`, server: 'x.com', platform: 'twitter' })
    )
    const [fediverse, twitter] = planPosts(
      postDestinations({
        method: 'external',
        viewer: viewer(),
        users: [user(), ...many],
        fromServer: 'handon.club',
      }),
      '集合は18時です',
      true
    )

    expect(fediverse.posts).toHaveLength(1)
    expect(twitter.posts.length).toBeGreaterThan(1)
    expect(twitter.posts.every((post) => post.characterCount <= 280)).toBe(true)
    // 分けても全員を呼ぶ
    expect(twitter.posts.flatMap((post) => post.mentions)).toHaveLength(30)
  })
})

describe('buildExternalUrl', () => {
  const open = (destination: PostDestination) =>
    new URL(buildExternalUrl({ destination, text: '@alice\n\n本文' }))

  it('投稿元が決まっていれば投稿画面まで進める', () => {
    const url = open({ network: 'fediverse', server: 'handon.club', users: [], limit: 500 })
    expect(url.origin + url.pathname).toBe('https://anypost.dev/share')
    expect(url.searchParams.get('t')).toBe('@alice\n\n本文')
    expect(url.searchParams.get('i')).toBe('handon.club')
    expect(url.searchParams.get('a')).toBe('1')
    // 公開範囲は選ばせない。移動先で変えられる
    expect(url.searchParams.get('v')).toBe('public')
  })

  it('決まっていなければ進めない。サーバーの選択画面に戻るだけになる', () => {
    const url = open({ network: 'fediverse', server: null, users: [], limit: 500 })
    expect(url.searchParams.has('i')).toBe(false)
    expect(url.searchParams.has('a')).toBe(false)
  })

  it('Xへも同じ形で渡す', () => {
    const url = open({ network: 'twitter', server: 'x.com', users: [], limit: 280 })
    expect(url.searchParams.get('i')).toBe('x.com')
    expect(url.searchParams.get('v')).toBe('public')
  })
})
