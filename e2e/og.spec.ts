import { expect, test, type APIRequestContext } from '@playwright/test'

import { createEvent, createPreEvent, loginMastodon } from './support'

/**
 * イベントと日程調整のリンクカードの画像（OG 画像）。`app/og/{events,pre-events}/[id]` と `server/metadata/`。
 *
 * 画像の中身（文字の並び）は目で確かめる。ここでは、配る形と、
 * 非公開のものに題名入りの画像を出さないことを見る。
 */

const stamp = () => Date.now().toString(36)

/** PNG の幅と高さ（IHDR） */
function pngSize(body: Buffer) {
  expect(body.subarray(1, 4).toString()).toBe('PNG')
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) }
}

async function ogImageUrl(request: APIRequestContext, path: string) {
  const html = await (await request.get(path)).text()
  return html.match(/<meta property="og:image" content="([^"]+)"/)?.[1]
}

/** イベントと日程調整は、同じ配り方をする（`server/og/respond.ts`） */
const KINDS = [
  { name: 'イベント', create: createEvent, page: 'events', og: 'events' },
  { name: '日程調整', create: createPreEvent, page: 'pre-events', og: 'pre-events' },
] as const

for (const kind of KINDS) {
  test(`公開の${kind.name}は、版の付いた絶対URLの画像を載せ、1200×630 の PNG を長く持たせる`, async ({ page, request }) => {
    await loginMastodon(page, `og${stamp()}`)
    const item = await kind.create(page, { title: `OG のテスト ${stamp()}` })

    const url = await ogImageUrl(request, `/${kind.page}/${item.id}`)
    expect(url).toMatch(new RegExp(`^http://localhost:3000/og/${kind.og}/${item.id}\\?v=\\d+$`))

    const res = await request.get(url!)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe('image/png')
    expect(res.headers()['cache-control']).toContain('immutable')
    expect(pngSize(await res.body())).toEqual({ width: 1200, height: 630 })
  })

  /*
    版が違えば作らずに今の版へ送る。`v` を変えて CDN を素通りさせ、
    描画を繰り返させる使い方を止める。
  */
  test(`${kind.name}: 版が違えば、今の版の URL へリダイレクトする`, async ({ page, request }) => {
    await loginMastodon(page, `og${stamp()}`)
    const item = await kind.create(page, { title: `OG のテスト ${stamp()}` })
    const current = await ogImageUrl(request, `/${kind.page}/${item.id}`)

    const res = await request.get(`/og/${kind.og}/${item.id}?v=1`, { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    expect(new URL(res.headers()['location'], 'http://localhost:3000').href).toBe(current)
  })

  test(`非公開・存在しない${kind.name}には、題名を含まない共通の画像を返す`, async ({ page, request }) => {
    await loginMastodon(page, `og${stamp()}`)
    const hidden = await kind.create(page, { title: `非公開の OG ${stamp()}`, isPublic: false })
    const shown = await kind.create(page, { title: `公開の OG ${stamp()}` })

    // 非公開のページは、固有の画像ではなく共通の画像を載せる
    expect(new URL((await ogImageUrl(request, `/${kind.page}/${hidden.id}`))!).pathname).toBe('/og/default')

    const generic = await (await request.get(`/og/${kind.og}/no-such-id`)).body()
    const forHidden = await request.get(`/og/${kind.og}/${hidden.id}`, { maxRedirects: 0 })
    expect(forHidden.status()).toBe(200)
    expect((await forHidden.body()).equals(generic)).toBe(true)

    // 対照: 公開のものは共通の画像と違う
    const forShown = await request.get((await ogImageUrl(request, `/${kind.page}/${shown.id}`))!)
    expect((await forShown.body()).equals(generic)).toBe(false)
  })
}

/*
  イベント・日程調整以外のページは、サイト共通の画像（`/og/default`）を載せる。静的なページの HTML は
  ビルド中に作られるので、公開URLはビルド引数で渡している（CI は本番の URL、手元は localhost）。
  どちらでも通るよう、ホストではなく「絶対URLで、パスが /og/default」を見る。
*/
test('イベント・日程調整以外のページは、サイト共通の画像を絶対URLで載せる', async ({ request }) => {
  for (const path of ['/', '/faq', '/events', '/pre-events', '/announcements']) {
    const url = await ogImageUrl(request, path)
    expect(url, `${path} の og:image`).toBeDefined()
    expect(new URL(url!).pathname, path).toBe('/og/default')
  }

  const res = await request.get('/og/default')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toBe('image/png')
  expect(res.headers()['cache-control']).toMatch(/^public/)
  expect(pngSize(await res.body())).toEqual({ width: 1200, height: 630 })
})
