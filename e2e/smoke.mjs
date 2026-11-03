/**
 * E2E スモーク。本番と同じイメージを起動して、外から叩いて確かめる。
 *
 * **ユニットテストに見えないものだけを見る。** ルートの中身はユニットテストが
 * 見ている。ここで見るのは、本番ビルドで初めて分かること:
 *
 * - 本番ビルドが起動し、主要なページと API が 200 を返す（クライアントのチャンクに
 *   生成クライアントが入るなど、ビルドだけが落ちる/起動だけが落ちる類）
 * - DB に繋がり、マイグレーションを当てた空の DB で API が応答する
 * - キャッシュのヘッダ（proxy.ts と next.config.ts の組み合わせ。ビルドしないと効き方が分からない）
 *
 * 画面の操作とリトライは入れない。
 *
 *   BASE_URL=http://127.0.0.1:3000 node e2e/smoke.mjs
 */

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3000'

/** 主要なページ。中身はクライアントが API から取るので、ここでは HTML が返ることだけを見る */
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
  '/api/health',
  '/api/v1/home',
  '/api/v1/events/sections',
  '/api/v1/pre-events/sections',
  '/api/v1/announcements',
]

const failures = []

async function check(name, fn) {
  try {
    await fn()
    console.log(`ok   ${name}`)
  } catch (error) {
    failures.push(name)
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.message : error}`)
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

async function get(path, headers = {}) {
  return fetch(new URL(path, BASE_URL), { headers, redirect: 'manual' })
}

for (const path of PAGES) {
  await check(`ページ ${path}`, async () => {
    const res = await get(path)
    expect(res.status === 200, `status ${res.status}`)
    expect(res.headers.get('content-type')?.includes('text/html'), `content-type ${res.headers.get('content-type')}`)
  })
}

for (const path of APIS) {
  await check(`API ${path}`, async () => {
    const res = await get(path)
    const text = await res.text()
    expect(res.status === 200, `status ${res.status}: ${text.slice(0, 200)}`)
    const body = JSON.parse(text)
    // `/api/health` 以外は統一エンベロープ（{ data }）で返る
    expect(path === '/api/health' || 'data' in body, `エンベロープが無い: ${JSON.stringify(body).slice(0, 200)}`)
  })
}

await check('無いページは 404', async () => {
  const res = await get('/no-such-page-for-e2e')
  expect(res.status === 404, `status ${res.status}`)
})

/*
  キャッシュのヘッダ。CLAUDE.md「レンダリングとキャッシュ」。
  どちらも本番ビルドで実測して決めたもので、ユニットテストでは効き方を確かめられない。
*/
await check('トップページは公開キャッシュに載せる', async () => {
  const res = await get('/')
  expect(res.headers.get('cache-control')?.startsWith('public'), `cache-control ${res.headers.get('cache-control')}`)
})

await check('RSC の要求は CDN に持たせない（Accept 無しで RSC: 1 だけ）', async () => {
  const res = await get('/faq?_rsc=e2e', { RSC: '1' })
  expect(res.headers.get('cdn-cache-control') === 'no-store', `cdn-cache-control ${res.headers.get('cdn-cache-control')}`)
})

if (failures.length > 0) {
  console.log(`\n${failures.length} 件失敗`)
  process.exit(1)
}
console.log('\nすべて通った')
