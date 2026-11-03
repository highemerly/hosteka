import { describe, expect, it } from 'vitest'

import { normalizeHost } from './normalize-host'

describe('normalizeHost', () => {
  it('そのままのホスト名を受ける', () => {
    expect(normalizeHost('handon.club')).toBe('handon.club')
  })

  it('URL やハンドルを貼られてもホスト名だけ取り出す', () => {
    expect(normalizeHost('https://handon.club/')).toBe('handon.club')
    expect(normalizeHost('http://handon.club/@user')).toBe('handon.club')
    expect(normalizeHost('@highemerly@handon.club')).toBe('handon.club')
  })

  it('大文字と前後の空白を吸収する。表記ゆれのまま保存すると判定が外れる', () => {
    expect(normalizeHost('  Handon.Club  ')).toBe('handon.club')
  })

  it('ホスト名として成立しない入力は null', () => {
    expect(normalizeHost('')).toBeNull()
    expect(normalizeHost('localhost')).toBeNull()
    expect(normalizeHost('example .com')).toBeNull()
    expect(normalizeHost('-bad.example')).toBeNull()
    expect(normalizeHost('example.com:3000')).toBeNull()
  })
})
