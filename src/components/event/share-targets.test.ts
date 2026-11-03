import { describe, expect, it } from 'vitest'

import {
  buildAnypostContactUrl,
  buildAnypostMentionUrl,
  buildAnypostShareUrl,
} from './share-targets'

describe('buildAnypostShareUrl', () => {
  it('本文はイベント名の次の行にURLを置く', () => {
    expect(
      buildAnypostShareUrl({ url: 'https://hosteka.example/events/abc', title: 'Fediverse 交流会' })
    ).toBe(
      'https://anypost.dev/share?t=Fediverse%20%E4%BA%A4%E6%B5%81%E4%BC%9A%0Ahttps%3A%2F%2Fhosteka.example%2Fevents%2Fabc'
    )
  })

  it('記号を含むイベント名でもクエリが壊れない', () => {
    const url = buildAnypostShareUrl({
      url: 'https://hosteka.example/events/abc?x=1&y=2',
      title: 'LT大会 #3 & 懇親会',
    })
    expect(url.startsWith('https://anypost.dev/share?t=')).toBe(true)
    // t 以外のパラメータが生えていない
    expect(new URL(url).searchParams.size).toBe(1)
    expect(new URL(url).searchParams.get('t')).toBe(
      'LT大会 #3 & 懇親会\nhttps://hosteka.example/events/abc?x=1&y=2'
    )
  })
})

describe('buildAnypostContactUrl', () => {
  const creator = { id: 'u1', username: 'alice', server: 'example.social', platform: 'mastodon' }
  const organizer = { id: 'u2', username: 'bob', server: 'misskey.example', platform: 'misskey' }
  const base = { url: 'https://hosteka.example/events/abc', title: '交流会' }

  const paramsOf = (url: string) => new URL(url).searchParams

  it('宛先のメンションを本文の先頭に並べる', () => {
    const url = buildAnypostContactUrl({
      ...base,
      targets: [creator, organizer],
      viewer: null,
    })!
    expect(paramsOf(url).get('t')).toBe(
      '@alice@example.social @bob@misskey.example\n\n「交流会」について\nhttps://hosteka.example/events/abc'
    )
  })

  it('ログイン中は自分のサーバーから投稿画面を直接開く', () => {
    const url = buildAnypostContactUrl({
      ...base,
      targets: [creator],
      viewer: { id: 'u9', server: 'my.example', platform: 'mastodon' },
    })!
    expect(paramsOf(url).get('i')).toBe('my.example')
    expect(paramsOf(url).get('a')).toBe('1')
  })

  it('未ログインなら投稿元を決められないので i も a も付けない', () => {
    const url = buildAnypostContactUrl({ ...base, targets: [creator], viewer: null })!
    expect(paramsOf(url).has('i')).toBe(false)
    expect(paramsOf(url).has('a')).toBe(false)
  })

  it('Discord でログインしている閲覧者には投稿元を渡さない', () => {
    const url = buildAnypostContactUrl({
      ...base,
      targets: [creator],
      viewer: { id: 'u9', server: 'discord.com', platform: 'discord' },
    })!
    expect(paramsOf(url).has('i')).toBe(false)
  })

  /*
    **宛先の居場所は見ない。** 以前は「主催者が X なら x.com」と宛先の側を
    優先していたが、届くかどうかを先読みするぶん、ログインしている人まで
    選択画面へ戻されていた。宛先が別の場所にいるなら、anypost.dev の
    投稿画面で選び直せばよい。
  */
  it('主催者が X にいても、ログイン中なら自分のサーバーを渡す', () => {
    const url = buildAnypostContactUrl({
      ...base,
      targets: [{ id: 'u3', username: 'carol', server: 'x.com', platform: 'twitter' }],
      viewer: { id: 'u9', server: 'my.example', platform: 'mastodon' },
    })!
    expect(paramsOf(url).get('i')).toBe('my.example')
    expect(paramsOf(url).get('a')).toBe('1')
  })

  /** 未ログインでは自分のサーバーが無い。宛先が X でも渡さない */
  it('未ログインなら、主催者が X でも投稿元を渡さない', () => {
    const url = buildAnypostContactUrl({
      ...base,
      targets: [{ id: 'u3', username: 'carol', server: 'x.com', platform: 'twitter' }],
      viewer: null,
    })!
    expect(paramsOf(url).has('i')).toBe(false)
    expect(paramsOf(url).has('a')).toBe(false)
  })

  /** X は anypost.dev の投稿先として選べる。自分のサーバーは x.com */
  it('X でログイン中なら x.com を渡す', () => {
    const url = buildAnypostContactUrl({
      ...base,
      targets: [creator],
      viewer: { id: 'u9', server: 'x.com', platform: 'twitter' },
    })!
    expect(paramsOf(url).get('i')).toBe('x.com')
    expect(paramsOf(url).get('a')).toBe('1')
  })

  it('Discord の主催者は宛先にしない', () => {
    expect(
      buildAnypostContactUrl({
        ...base,
        targets: [{ id: 'u4', username: 'dave', server: 'discord.com', platform: 'discord' }],
        viewer: null,
      })
    ).toBeNull()
  })

  it('自分だけが宛先なら null を返す', () => {
    expect(
      buildAnypostContactUrl({
        ...base,
        targets: [creator],
        viewer: { id: 'u1', server: 'example.social', platform: 'mastodon' },
      })
    ).toBeNull()
  })

  it('作成者が幹事も兼ねていても同じ相手を2回呼ばない', () => {
    const url = buildAnypostContactUrl({
      ...base,
      targets: [creator, creator],
      viewer: null,
    })!
    expect(paramsOf(url).get('t')?.startsWith('@alice@example.social\n\n')).toBe(true)
  })
})

describe('buildAnypostMentionUrl', () => {
  const person = { id: 'u1', username: 'alice', server: 'example.social', platform: 'mastodon' }
  const paramsOf = (url: string) => new URL(url).searchParams

  /*
    **本文はメンションだけ。** イベントやグループへの連絡と違い、
    ここには「何について」が無い。相手のページのURLを添えても、
    受け取るのは本人なので何も伝わらない。
  */
  it('メンションだけを入れる。ページのURLは添えない', () => {
    const url = buildAnypostMentionUrl({ targets: [person], viewer: null })!
    expect(paramsOf(url).get('t')).toBe('@alice@example.social ')
  })

  it('ログイン中は自分のサーバーから投稿画面を直接開く', () => {
    const url = buildAnypostMentionUrl({
      targets: [person],
      viewer: { id: 'u9', server: 'my.example', platform: 'mastodon' },
    })!
    expect(paramsOf(url).get('i')).toBe('my.example')
    expect(paramsOf(url).get('a')).toBe('1')
  })

  it('未ログインなら投稿元を決められないので i も a も付けない', () => {
    const url = buildAnypostMentionUrl({ targets: [person], viewer: null })!
    expect(paramsOf(url).has('i')).toBe(false)
    expect(paramsOf(url).has('a')).toBe(false)
  })

  it('相手が X にいても、ログイン中なら自分のサーバーを渡す', () => {
    const url = buildAnypostMentionUrl({
      targets: [{ id: 'u2', username: 'bob', server: 'x.com', platform: 'twitter' }],
      viewer: { id: 'u9', server: 'my.example', platform: 'mastodon' },
    })!
    expect(paramsOf(url).get('i')).toBe('my.example')
  })

  it('X でログイン中なら x.com を渡す', () => {
    const url = buildAnypostMentionUrl({
      targets: [person],
      viewer: { id: 'u9', server: 'x.com', platform: 'twitter' },
    })!
    expect(paramsOf(url).get('i')).toBe('x.com')
  })

  /*
    **Discord だけは渡さない。** anypost.dev の投稿先として選べないので、
    `i=discord.com` を渡しても選択画面に戻るだけになる。
  */
  it('Discord でログイン中なら投稿元を渡さない', () => {
    const url = buildAnypostMentionUrl({
      targets: [person],
      viewer: { id: 'u9', server: 'discord.com', platform: 'discord' },
    })!
    expect(paramsOf(url).has('i')).toBe(false)
  })

  /** `@name@discord.com` は Fediverse でも X でも解決しない */
  it('Discord の人には null を返す。ボタンごと出さない', () => {
    expect(
      buildAnypostMentionUrl({
        targets: [{ id: 'u3', username: 'carol', server: 'discord.com', platform: 'discord' }],
        viewer: null,
      })
    ).toBeNull()
  })

  /** 自分宛のメンションを開いても誰にも届かない */
  it('自分のページでは null を返す', () => {
    expect(
      buildAnypostMentionUrl({
        targets: [person],
        viewer: { id: 'u1', server: 'example.social', platform: 'mastodon' },
      })
    ).toBeNull()
  })
})
