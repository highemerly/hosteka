import { describe, expect, it } from 'vitest'

import { bannedSearchWhere, userSearchWhere } from './admin-search'

describe('userSearchWhere', () => {
  it('名前@サーバー はユーザー名とサーバーの両方で絞る', () => {
    expect(userSearchWhere('alice@example.social')).toEqual({
      AND: [
        { username: { contains: 'alice', mode: 'insensitive' } },
        { server: { contains: 'example.social', mode: 'insensitive' } },
      ],
    })
  })

  it('先頭の @ は無視する（ハンドルをそのまま貼れる）', () => {
    expect(userSearchWhere('@alice@example.social')).toEqual(userSearchWhere('alice@example.social'))
  })

  it('@ が無ければ名前・サーバー・IP のどれかに当たる。IP の欄を別に探させない', () => {
    const where = userSearchWhere('192.168.1')
    expect(where.OR).toContainEqual({ ipAddresses: { contains: '192.168.1' } })
    expect(where.OR).toContainEqual({ server: { contains: '192.168.1', mode: 'insensitive' } })
  })
})

describe('bannedSearchWhere', () => {
  it('BAN 済みは名前しか残っていないので、ユーザー名とサーバーだけを見る', () => {
    expect(bannedSearchWhere('spam')).toEqual({
      OR: [
        { username: { contains: 'spam', mode: 'insensitive' } },
        { server: { contains: 'spam', mode: 'insensitive' } },
      ],
    })
  })
})
