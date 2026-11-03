import { describe, expect, it } from 'vitest'

import { OAUTH_REQUESTS, canRequestWrite, oauthGrants, oauthScope } from './oauth-scopes'

describe('要求する権限', () => {
  /**
   * **ここが変わるのは、利用者に求める権限が変わるとき。** 表を書き換えた
   * ついでに黙って広がらないよう、送る文字列をそのまま押さえる。
   */
  it('相手のサーバーへ送る scope', () => {
    expect(oauthScope('mastodon', false)).toBe('read:accounts')
    expect(oauthScope('mastodon', true)).toBe('read:accounts read:statuses write:statuses')
    expect(oauthScope('misskey', false)).toBe('read:account')
    expect(oauthScope('misskey', true)).toBe('read:account,write:notes')
    expect(oauthScope('pleroma', false)).toBe('read:accounts')
    expect(oauthScope('twitter', false)).toBe('users.read tweet.read')
    expect(oauthScope('discord', false)).toBe('identify')
  })

  it('投稿を頼めないプラットフォームで投稿を指定しても、読み取りのものを返す', () => {
    expect(oauthScope('pleroma', true)).toBe('read:accounts')
    expect(oauthScope('discord', true)).toBe('identify')
  })

  it('投稿を頼めるのは Mastodon と Misskey だけ', () => {
    expect(
      (Object.keys(OAUTH_REQUESTS) as (keyof typeof OAUTH_REQUESTS)[]).filter(canRequestWrite)
    ).toEqual(['mastodon', 'misskey'])
  })

  /** 説明の無い権限を要求しない — モーダルに空の行が出る */
  it('要求するすべての権限に、許すことと使い道の説明がある', () => {
    for (const platform of Object.keys(OAUTH_REQUESTS) as (keyof typeof OAUTH_REQUESTS)[]) {
      for (const write of [false, true]) {
        for (const g of oauthGrants(platform, write)) {
          expect(g.label, `${platform} ${g.scope}`).not.toBe('')
          expect(g.use, `${platform} ${g.scope}`).not.toBe('')
        }
      }
    }
  })
})
