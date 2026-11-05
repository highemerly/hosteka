import { expect, test } from '@playwright/test'

import { openCleanly } from './support'

/**
 * 未ログインで開けるもの。**ユニットテストに見えないものだけを見る**:
 * 本番ビルドが起動して主要なページと API が応答すること、ブラウザで JS の例外が出ないこと、
 * キャッシュのヘッダ（proxy.ts と next.config.ts の組み合わせ。ビルドしないと効き方が分からない）。
 */

const PAGES = [
  '/',
  '/events',
  '/pre-events',
  '/announcements',
  '/faq',
  '/terms',
  '/privacy',
  '/release-notes',
  '/markdown-guide',
  '/auth/signin',
]

/** 未ログインで開ける API。マイグレーションを当てた空の DB で応答すること */
const APIS = [
  '/api/v1/home',
  '/api/v1/events/sections',
  '/api/v1/pre-events/sections',
  '/api/v1/announcements',
]

for (const path of PAGES) {
  test(`ページ ${path} が開け、JS の例外が出ない`, async ({ page }) => {
    await openCleanly(page, path)
  })
}

test('DB に繋がっている', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  expect(await res.json()).toMatchObject({ database: 'ok' })
})

for (const path of APIS) {
  test(`API ${path} が統一エンベロープで応答する`, async ({ request }) => {
    const res = await request.get(path)
    expect(res.status(), await res.text()).toBe(200)
    expect(await res.json()).toHaveProperty('data')
  })
}

test('無いページは 404', async ({ request }) => {
  expect((await request.get('/no-such-page-for-e2e')).status()).toBe(404)
})

/* キャッシュのヘッダ。CLAUDE.md「レンダリングとキャッシュ」 */
test('トップページは公開キャッシュに載せる', async ({ request }) => {
  const res = await request.get('/')
  expect(res.headers()['cache-control']).toMatch(/^public/)
})

test('RSC の要求は CDN に持たせない（Accept 無しで RSC: 1 だけ）', async ({ request }) => {
  const res = await request.get('/faq?_rsc=e2e', { headers: { RSC: '1' }, maxRedirects: 0 })
  expect(res.headers()['cdn-cache-control']).toBe('no-store')
})

/*
  CSP（next.config.ts）。違反が無いことは openCleanly が各ページで見ている。
  ここでは、付いていること（付いていなければ違反も起きない）と、インラインの
  スクリプトを止める形になっていないことを見る。
*/
test('ページに CSP が付き、インラインのスクリプトを止めない', async ({ request }) => {
  const csp = (await request.get('/')).headers()['content-security-policy'] ?? ''
  expect(csp).toContain("script-src 'self' 'unsafe-inline'")
  expect(csp).toContain("frame-ancestors 'none'")
  // ハッシュや nonce があると、ブラウザは 'unsafe-inline' を無視する
  expect(csp).not.toMatch(/'(sha256|sha384|sha512|nonce)-/)
})
