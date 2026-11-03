import { describe, expect, it } from 'vitest'

import { setFlash, takeFlash } from './flash'
import { STORAGE_FLASH } from './storage-keys'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

describe('flash', () => {
  it('預けた知らせを取り出せる', () => {
    const storage = memoryStorage()
    setFlash({ type: 'success', message: 'ログアウトしました' }, storage)
    expect(takeFlash(storage)).toEqual({ type: 'success', message: 'ログアウトしました' })
  })

  it('取り出すと消える。戻るで同じ知らせが出直さない', () => {
    const storage = memoryStorage()
    setFlash({ type: 'success', message: 'ログアウトしました' }, storage)
    takeFlash(storage)
    expect(takeFlash(storage)).toBeNull()
  })

  it('壊れた値・知らない種類は捨てる', () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_FLASH, '{not json')
    expect(takeFlash(storage)).toBeNull()

    storage.setItem(STORAGE_FLASH, JSON.stringify({ type: 'info', message: 'x' }))
    expect(takeFlash(storage)).toBeNull()

    storage.setItem(STORAGE_FLASH, JSON.stringify({ type: 'success', message: '' }))
    expect(takeFlash(storage)).toBeNull()
  })

  it('ストレージに触れない環境でも落ちない', () => {
    expect(() => setFlash({ type: 'success', message: 'x' }, null)).not.toThrow()
    expect(takeFlash(null)).toBeNull()
  })
})
