import { afterEach, describe, expect, it, vi } from 'vitest'

import { COOKIE_VIEWER } from '@/lib/cookie-names'
import { RUM_AUTH_ATTRIBUTE, RUM_AUTH_INIT_SCRIPT, markRumLoggedOut } from './rum-auth'

describe('RUM_AUTH_INIT_SCRIPT', () => {
  // <head> で同期実行する文字列なので、実際に評価して確かめる
  function run(cookie: string): string | undefined {
    const attrs: Record<string, string> = {}
    const document = {
      cookie,
      documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
    }
    new Function('document', RUM_AUTH_INIT_SCRIPT)(document)
    return attrs[RUM_AUTH_ATTRIBUTE]
  }

  it('ビューア Cookie があれば in', () => {
    expect(run(`a=1; ${COOKIE_VIEWER}=eyJ2IjoxfQ; b=2`)).toBe('in')
    expect(run(`${COOKIE_VIEWER}=eyJ2IjoxfQ`)).toBe('in')
  })

  it('無いか空なら out', () => {
    expect(run('')).toBe('out')
    expect(run(`${COOKIE_VIEWER}=`)).toBe('out')
    expect(run('a=1; b=2')).toBe('out')
  })

  it('名前の前方一致で取り違えない', () => {
    // 別の Cookie の名前がビューアの名前で始まっていても、ビューアではない
    expect(run(`${COOKIE_VIEWER}x=1`)).toBe('out')
    expect(run(`x${COOKIE_VIEWER}=1`)).toBe('out')
  })
})

describe('markRumLoggedOut', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('属性を out にする', () => {
    const attrs: Record<string, string> = { [RUM_AUTH_ATTRIBUTE]: 'in' }
    vi.stubGlobal('document', {
      documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
    })
    markRumLoggedOut()
    expect(attrs[RUM_AUTH_ATTRIBUTE]).toBe('out')
  })

  it('サーバーでは何もしない', () => {
    expect(() => markRumLoggedOut()).not.toThrow()
  })
})
