import { describe, expect, it } from 'vitest'

import { profileSocialAccounts } from './profile-social-accounts'

const LOGIN = { platform: 'mastodon', username: 'taro', server: 'example.social' }

describe('profileSocialAccounts', () => {
  it('ログインに使っているアカウントを先頭に置く', () => {
    const rows = profileSocialAccounts(LOGIN, [
      { platform: 'misskey', username: 'taro', server: 'misskey.io' },
    ])
    expect(rows[0]).toEqual({
      ...LOGIN,
      isLogin: true,
      url: 'https://example.social/@taro',
    })
    expect(rows[1].isLogin).toBe(false)
  })

  it('追加した順を保つ', () => {
    const rows = profileSocialAccounts(LOGIN, [
      { platform: 'misskey', username: 'a', server: 'misskey.io' },
      { platform: 'twitter', username: 'b', server: 'x.com' },
      { platform: 'pleroma', username: 'c', server: 'pleroma.example' },
    ])
    expect(rows.map((r) => r.platform)).toEqual(['mastodon', 'misskey', 'twitter', 'pleroma'])
  })

  /*
    重複を消さない。ログインと同じものを書くのも、同じプラットフォームを
    2つ並べるのも、本人がそうしたいなら通す仕様。
  */
  it('ログインと同じアカウントを追加しても消さない', () => {
    const rows = profileSocialAccounts(LOGIN, [LOGIN])
    expect(rows).toHaveLength(2)
    expect(rows[0].isLogin).toBe(true)
    expect(rows[1].isLogin).toBe(false)
  })

  it('同じプラットフォームを2つ並べられる', () => {
    const rows = profileSocialAccounts(LOGIN, [
      { platform: 'mastodon', username: 'a', server: 'mastodon.social' },
      { platform: 'mastodon', username: 'b', server: 'handon.club' },
    ])
    expect(rows).toHaveLength(3)
  })

  it('X は x.com のプロフィールを指す。Fediverse の書き方では開けない', () => {
    const rows = profileSocialAccounts(LOGIN, [
      { platform: 'twitter', username: 'taro', server: 'x.com' },
    ])
    expect(rows[1].url).toBe('https://x.com/taro')
  })

  /*
    Discord はユーザー名から開けるプロフィールの URL が無い。
    リンクにせずテキストで出すのは画面の仕事だが、判断はここが返す。
  */
  it('Discord は開けないので url が null', () => {
    const rows = profileSocialAccounts(LOGIN, [
      { platform: 'discord', username: 'taro', server: 'discord.com' },
    ])
    expect(rows[1].url).toBeNull()
  })

  it('追加が無ければログインの1件だけ', () => {
    expect(profileSocialAccounts(LOGIN, [])).toHaveLength(1)
  })
})
