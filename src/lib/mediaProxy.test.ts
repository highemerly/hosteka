import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { getAvatarUrl } from './mediaProxy'

describe('getAvatarUrl', () => {
  it('proxy 経由のURLにする', () => {
    expect(getAvatarUrl('https://handon.club/avatars/1.png')).toBe(
      'https://delivery.piyo.me/proxy/image.webp?url=https%3A%2F%2Fhandon.club%2Favatars%2F1.png&avatar=1&fallback'
    )
  })

  it('クエリ付きのURLでもパラメータが混ざらない', () => {
    const url = new URL(getAvatarUrl('https://s.example/a.png?v=2&x=1'))
    expect(url.searchParams.get('url')).toBe('https://s.example/a.png?v=2&x=1')
  })

  it('Misskey のプロキシのURLは、中の元画像を渡す', () => {
    const url = new URL(
      getAvatarUrl(
        'https://mi.example/proxy/avatar.webp?url=https%3A%2F%2Fs3.example%2Fbucket%2Fa.jpg&avatar=1'
      )
    )
    expect(url.searchParams.get('url')).toBe('https://s3.example/bucket/a.jpg')
  })

  it('外部のメディアプロキシ（/proxy を挟まない形）でも剥がす', () => {
    const url = new URL(
      getAvatarUrl('https://media.example/avatar.webp?url=https%3A%2F%2Fs3.example%2Fa.jpg&avatar=1')
    )
    expect(url.searchParams.get('url')).toBe('https://s3.example/a.jpg')
  })

  it('url が http(s) でなければ剥がさない', () => {
    const original = 'https://mi.example/proxy/avatar.webp?url=javascript%3Aalert(1)&avatar=1'
    expect(new URL(getAvatarUrl(original)).searchParams.get('url')).toBe(original)
  })

  it('avatar.webp という名前の元画像は剥がさない', () => {
    const original = 'https://handon.club/avatars/avatar.webp'
    expect(new URL(getAvatarUrl(original)).searchParams.get('url')).toBe(original)
  })

  it('未設定なら既定のアバターを返す', () => {
    expect(getAvatarUrl(null)).toBe('/default-avatar.svg')
    expect(getAvatarUrl(undefined)).toBe('/default-avatar.svg')
    expect(getAvatarUrl('')).toBe('/default-avatar.svg')
  })
})

/**
 * 画面が外部URLを直に <img> へ渡していないことを確かめる。
 *
 * 直に貼ると閲覧者の IP と Referer が相手のサーバーへ渡り、
 * 画像のサイズも形式も向こう任せになる。一覧では数十枚が並ぶので、
 * 1箇所の抜けがそのまま帯域と待ち時間になる。
 */
const WATCHED_DIRS = ['src/components', 'src/screens']

function collectFiles(dir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  return entries.flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return collectFiles(full)
    return full.endsWith('.tsx') ? [full] : []
  })
}

describe('新UIのアバター表示', () => {
  it('<img> の src は必ず getAvatarUrl を通す', () => {
    const offenders: string[] = []

    for (const dir of WATCHED_DIRS) {
      for (const file of collectFiles(dir)) {
        const source = readFileSync(file, 'utf8')
        // src={...} のうち、getAvatarUrl( を含まないものを拾う
        for (const match of source.matchAll(/<img[\s\S]*?\/>/g)) {
          const tag = match[0]
          if (!tag.includes('src=')) continue
          if (tag.includes('getAvatarUrl(')) continue
          offenders.push(file)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
