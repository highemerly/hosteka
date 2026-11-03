import { describe, expect, it } from 'vitest'

import { DISPLAY_NAME_MAX, sanitizeAvatarUrl, sanitizeDisplayName } from './profile-text'

describe('sanitizeDisplayName', () => {
  /*
    **改行で ICS に行を書き足させない。** `ORGANIZER;CN="..."` の値に改行が
    入ると、`URL:` や `BEGIN:VALARM` を好きに足せる。
  */
  it('改行やタブは空白になり、1行に収まる', () => {
    expect(sanitizeDisplayName('Alice\r\nURL:https://evil.example\r\nBEGIN:VALARM', 'alice')).toBe(
      'Alice URL:https://evil.example BEGIN:VALARM'
    )
    expect(sanitizeDisplayName('A\tB\u2028C\u0000D', 'x')).toBe('A B C D')
  })

  it('絵文字と結合文字は残す', () => {
    expect(sanitizeDisplayName('たろう 👨‍👩‍👧 :custom:', 'taro')).toBe('たろう 👨‍👩‍👧 :custom:')
  })

  it(`長さは${DISPLAY_NAME_MAX}文字まで（文字で数える）`, () => {
    const name = sanitizeDisplayName('😀'.repeat(500), 'x')
    expect(Array.from(name)).toHaveLength(DISPLAY_NAME_MAX)
  })

  it('空・空白だけ・文字列でないものは、ユーザー名を使う', () => {
    expect(sanitizeDisplayName('', 'taro')).toBe('taro')
    expect(sanitizeDisplayName(' \n ', 'taro')).toBe('taro')
    expect(sanitizeDisplayName(null, 'taro')).toBe('taro')
    expect(sanitizeDisplayName({ evil: true }, 'taro')).toBe('taro')
  })
})

describe('sanitizeAvatarUrl', () => {
  it('https の URL だけを残す', () => {
    expect(sanitizeAvatarUrl('https://files.example/a.png')).toBe('https://files.example/a.png')
    expect(sanitizeAvatarUrl('http://files.example/a.png')).toBeNull()
    expect(sanitizeAvatarUrl('javascript:alert(1)')).toBeNull()
    expect(sanitizeAvatarUrl('not a url')).toBeNull()
    expect(sanitizeAvatarUrl(undefined)).toBeNull()
  })
})
