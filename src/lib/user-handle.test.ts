import { describe, expect, it } from 'vitest'

import { formatUserHandle, parseUserHandle, userProfilePath } from './user-handle'

describe('parseUserHandle', () => {
  it('素の形を割る', () => {
    expect(parseUserHandle('alice@mastodon.social')).toEqual({
      username: 'alice',
      server: 'mastodon.social',
    })
  })

  it('符号化された @ を受ける', () => {
    expect(parseUserHandle('alice%40mastodon.social')).toEqual({
      username: 'alice',
      server: 'mastodon.social',
    })
  })

  it('Fediverse の書き方で貼られた先頭の @ を落とす', () => {
    expect(parseUserHandle('@alice@mastodon.social')).toEqual({
      username: 'alice',
      server: 'mastodon.social',
    })
  })

  it('大文字を畳む。畳まないと PostgreSQL の一意制約で引けない', () => {
    expect(parseUserHandle('Alice@Mastodon.Social')).toEqual({
      username: 'alice',
      server: 'mastodon.social',
    })
  })

  it('X と Discord の固定サーバーも通る', () => {
    expect(parseUserHandle('bob@x.com')).toEqual({ username: 'bob', server: 'x.com' })
    expect(parseUserHandle('carol@discord.com')).toEqual({
      username: 'carol',
      server: 'discord.com',
    })
  })

  it('ドットやアンダースコアを含むユーザー名を通す', () => {
    expect(parseUserHandle('a.b_c-d@misskey.io')).toEqual({
      username: 'a.b_c-d',
      server: 'misskey.io',
    })
  })

  it('サーバーが無ければ null', () => {
    expect(parseUserHandle('alice')).toBeNull()
  })

  it('空なら null', () => {
    expect(parseUserHandle('')).toBeNull()
    expect(parseUserHandle('@')).toBeNull()
  })

  it('ユーザー名が空なら null', () => {
    expect(parseUserHandle('@@mastodon.social')).toBeNull()
  })

  it('サーバーが空なら null', () => {
    expect(parseUserHandle('alice@')).toBeNull()
  })

  it('ホスト名の形でなければ null', () => {
    expect(parseUserHandle('alice@localhost')).toBeNull()
    expect(parseUserHandle('alice@mastodon social')).toBeNull()
  })

  it('二重の @ は最後で割る', () => {
    expect(parseUserHandle('@alice@sub@mastodon.social')).toBeNull()
  })

  it('壊れた符号化でも落ちない', () => {
    expect(parseUserHandle('%E0%A4%A@x.com')).toBeNull()
  })

  it('検証の入口（/api/v1/users/check）と衝突しない。@ が無いので null', () => {
    expect(parseUserHandle('check')).toBeNull()
  })
})

describe('formatUserHandle / userProfilePath', () => {
  it('@ を前に付けない', () => {
    expect(formatUserHandle({ username: 'alice', server: 'x.com' })).toBe('alice@x.com')
  })

  /*
    **`%40` にしない。** RFC 3986 でパスに置ける文字で、符号化すると
    URL 欄に出たときも共有されたときも読めない。
  */
  it('リンク先は @ をそのまま出す', () => {
    expect(userProfilePath({ username: 'alice', server: 'x.com' })).toBe('/users/alice@x.com')
  })

  it('作ったリンク先をそのまま解釈し直せる', () => {
    const user = { username: 'alice', server: 'mastodon.social' }
    const path = userProfilePath(user)
    expect(parseUserHandle(path.replace('/users/', ''))).toEqual(user)
  })
})
