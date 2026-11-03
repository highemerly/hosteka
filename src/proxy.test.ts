import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'

import { proxy } from './proxy'

function req(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(`https://hosteka.piyo.me${path}`), { headers })
}

describe('キャッシュヘッダ', () => {
  it('通常のHTMLリクエストでは公開キャッシュを許可する', () => {
    const res = proxy(req('/', { accept: 'text/html' }))
    expect(res.headers.get('Cache-Control')).toContain('public')
  })

  // Cloudflare は Accept-Encoding 以外の Vary を無視するため、RSC フライト
  // ペイロードと HTML が同一キャッシュキーに同居する。ログイン中ユーザーの
  // クライアント遷移が生成したペイロードが公開キャッシュに載り、匿名ユーザーへ
  // 配信される。ここが public に戻るとそうなる。
  //
  // 判定は accept ヘッダで行う。RSC / Next-Router-* ヘッダは Next.js が
  // ミドルウェア到達前に除去するため使えない（本番ビルドで実測済み）。
  it.each([
    ['text/x-component'],
    ['text/x-component;q=0.9'],
  ])('フライトリクエスト (accept: %s) は公開キャッシュに載せない', (accept) => {
    const res = proxy(req('/', { accept }))
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache, no-store')
  })

  // 除去されるヘッダに依存した実装に戻ると、テストは通るのに本番では
  // 効かないという状態になる。accept が付いていなければ public のままで
  // よいことを明示しておく。
  it('RSCヘッダのみでは判定できない（ミドルウェアに届かないため）', () => {
    const res = proxy(req('/', { rsc: '1' }))
    expect(res.headers.get('Cache-Control')).toContain('public')
  })

  it('キャッシュ対象外のパスは常に no-store', () => {
    // /dashboard は未ログイン時にリダイレクトされ addCacheHeaders を通らないため、
    // 保護対象ではないがキャッシュ対象でもないパスで検証する。
    expect(proxy(req('/events/abc')).headers.get('Cache-Control')).toBe(
      'private, no-cache, no-store'
    )
  })

  it('キャッシュ対象の各パスがHTMLでは公開キャッシュになる', () => {
    for (const p of ['/', '/faq', '/terms', '/privacy', '/feature', '/release-notes']) {
      expect(proxy(req(p)).headers.get('Cache-Control'), p).toContain('public')
    }
  })
})

/*
  Cookie の有無しか見ない**UXのための判定**であって、認可ではない
  （実際の認可は各ルートの getSession()）。ここが漏れると、開いても
  何も出せない画面をログインしていない人に読み込ませることになる。
*/
describe('ログインが要る画面', () => {
  it.each([
    ['/dashboard'],
    ['/events/create'],
    ['/pre-events/create'],
    ['/events/abc/edit'],
    ['/pre-events/abc/edit'],
    ['/pre-events/abc/contact'],
    ['/admin'],
    ['/admin/reports/abc'],
  ])('%s は Cookie が無ければサインインへ送る', (path) => {
    const res = proxy(req(path))
    expect(res.headers.get('location')).toContain('/auth/signin')
  })

  it.each([['/pre-events/abc'], ['/events/abc'], ['/pre-events']])(
    '%s は誰でも開ける',
    (path) => {
      expect(proxy(req(path)).headers.get('location')).toBeNull()
    }
  )
})

/*
  **RSC の要求は CDN に持たせない**（`next.config.ts` の RSC_MARKERS）。
  `rsc` ヘッダも `_rsc` クエリも proxy には届かないので、ここ（proxy）では
  止められない。止めているのは next.config の `has` で、本番ビルドで
  `/` に `RSC: 1` を付けたときに `CDN-Cache-Control: no-store` が付くことを
  確かめてある。その規則が消えていないことをここで見る。
*/
describe('RSC の要求と CDN', () => {
  it.each([
    { type: 'header', key: 'rsc' },
    { type: 'query', key: '_rsc' },
  ])('$type の $key があれば、全パスで CDN に持たせない', async (marker) => {
    const { default: nextConfig } = await import('../next.config')
    const rules = (await nextConfig.headers?.()) ?? []

    const rule = rules.find((r) => r.has?.some((h) => h.type === marker.type && h.key === marker.key))
    expect(rule?.source).toBe('/:path*')
    expect(rule?.headers).toContainEqual({ key: 'CDN-Cache-Control', value: 'no-store' })
  })
})
