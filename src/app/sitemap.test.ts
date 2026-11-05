import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/sitemap', () => ({ buildSitemap: vi.fn() }))

import { buildSitemap } from '@/server/sitemap'

/**
 * **組み立てた結果を1時間覚えておく**（無認証で叩ける口が、毎回 DB を引かないように）。
 * 中身は `server/sitemap.test.ts`。
 */

const build = vi.mocked(buildSitemap)
const ENTRY = [{ url: 'https://hosteka.test' }]

// 覚えた結果はモジュールに残るので、テストごとに読み直す
async function load() {
  vi.resetModules()
  return (await import('./sitemap')).default
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-06T12:00:00+09:00'))
  build.mockReset()
  build.mockResolvedValue(ENTRY)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('sitemap.xml', () => {
  it('1時間以内なら、組み立て直さずに同じ結果を返す', async () => {
    const sitemap = await load()
    expect(await sitemap()).toBe(ENTRY)
    vi.advanceTimersByTime(59 * 60 * 1000)
    expect(await sitemap()).toBe(ENTRY)
    expect(build).toHaveBeenCalledTimes(1)
  })

  it('1時間たったら組み立て直す', async () => {
    const sitemap = await load()
    await sitemap()
    vi.advanceTimersByTime(60 * 60 * 1000)
    await sitemap()
    expect(build).toHaveBeenCalledTimes(2)
  })

  it('同時に来ても、組み立てるのは1回', async () => {
    const sitemap = await load()
    await Promise.all([sitemap(), sitemap(), sitemap()])
    expect(build).toHaveBeenCalledTimes(1)
  })

  it('失敗は覚えない。次の要求で組み立て直す', async () => {
    const sitemap = await load()
    build.mockRejectedValueOnce(new Error('db down'))
    await expect(sitemap()).rejects.toThrow('db down')
    expect(await sitemap()).toBe(ENTRY)
    expect(build).toHaveBeenCalledTimes(2)
  })
})
