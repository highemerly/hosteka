import { describe, expect, it } from 'vitest'

import { hasMisskeyWritePermission, hasWriteScope } from './write-scope'

describe('hasWriteScope', () => {
  it('投稿の権限を要求したトークン', () => {
    expect(hasWriteScope('read:accounts read:statuses write:statuses')).toBe(true)
  })

  it('読み取りだけのトークン', () => {
    expect(hasWriteScope('read:accounts')).toBe(false)
  })

  it('広い write は投稿も含む', () => {
    expect(hasWriteScope('read write')).toBe(true)
  })

  /*
    **前方一致で見ない。** `write:bookmarks` だけでは投稿できないので、
    「write で始まるか」で判定すると、送ってから断られることになる。
  */
  it('write で始まる別の権限を投稿できると誤らない', () => {
    expect(hasWriteScope('read:accounts write:bookmarks')).toBe(false)
  })

  /*
    **「分からない」を false にしない。** 権限を持っている人まで
    「権限が要ります」と言われ、不要な入り直しを強いることになる。
  */
  it('scope が返ってこなければ「分からない」', () => {
    expect(hasWriteScope(null)).toBeNull()
    expect(hasWriteScope(undefined)).toBeNull()
    expect(hasWriteScope('')).toBeNull()
  })
})

describe('hasMisskeyWritePermission', () => {
  it('要求した権限で決める。MiAuth は権限を返さない', () => {
    expect(hasMisskeyWritePermission(true)).toBe(true)
    expect(hasMisskeyWritePermission(false)).toBe(false)
  })
})
