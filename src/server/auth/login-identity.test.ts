import { describe, expect, it } from 'vitest'

import { loginIdentity } from './login-identity'

/**
 * **保存する前に形を確かめる。** username の出どころは利用者が指定した
 * 任意のサーバーの応答で、正規化は小文字化だけだった。`@` 入りの username が
 * 保存できると、`username@server` を切り直す判定を騙せる。
 */
describe('loginIdentity', () => {
  it('小文字に畳んで返す', () => {
    expect(loginIdentity('Alice', 'Mastodon.Social')).toEqual({
      username: 'alice',
      server: 'mastodon.social',
    })
  })

  it('前後の空白を落とす', () => {
    expect(loginIdentity('  alice  ', ' mastodon.social ')).toEqual({
      username: 'alice',
      server: 'mastodon.social',
    })
  })

  it('記号を含むユーザー名も、使える範囲なら通す', () => {
    expect(loginIdentity('a_b.c-d', 'misskey.io')).toEqual({
      username: 'a_b.c-d',
      server: 'misskey.io',
    })
  })

  /*
    **これが通ると、`email.split('@')[1]` を見ている判定を騙せる。**
    `attacker@mastodon.social` を username として保存できると、
    自前のサーバーから入った人が「mastodon.social の人」として扱われる。
  */
  it('@ を含むユーザー名は断る', () => {
    expect(loginIdentity('attacker@mastodon.social', 'evil.example')).toBeNull()
  })

  it('空のユーザー名は断る', () => {
    expect(loginIdentity('', 'mastodon.social')).toBeNull()
    expect(loginIdentity('   ', 'mastodon.social')).toBeNull()
  })

  it('100文字を超えるユーザー名は断る', () => {
    expect(loginIdentity('a'.repeat(101), 'mastodon.social')).toBeNull()
  })

  it('ホスト名の形でないサーバーは断る', () => {
    expect(loginIdentity('alice', 'localhost')).toBeNull()
    expect(loginIdentity('alice', '')).toBeNull()
  })

  it('文字列でないものは断る', () => {
    expect(loginIdentity(undefined, 'mastodon.social')).toBeNull()
    expect(loginIdentity({ username: 'alice' }, 'mastodon.social')).toBeNull()
    expect(loginIdentity('alice', null)).toBeNull()
  })

  /** 読む側（`parseUserHandle`）と同じ形を要求する */
  it('読む側が受け付ける形と揃っている', async () => {
    const { parseUserHandle } = await import('@/lib/user-handle')
    const identity = loginIdentity('a_b.c-d', 'misskey.io')
    expect(identity).not.toBeNull()
    expect(parseUserHandle(`${identity!.username}@${identity!.server}`)).toEqual(identity)
  })
})
