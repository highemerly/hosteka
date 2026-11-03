import { expect, test, type Browser } from '@playwright/test'

import { createEvent, createPreEvent, loginMastodon, metadataText, waitForApiIdle } from './support'

/**
 * **非公開のもの（`isPublic: false`）は、未ログインには中身もメタデータも見せない。**
 *
 * ページそのもの（HTML の殻）は誰にでも 200 で返るので、ステータスでは分からない。
 * 見るのは、API が 401 を返すこと、画面に題名が出ないこと、head（`<title>`・
 * `description`・OGP）に題名も説明も出ないこと。空振りしていないことは、
 * 公開のものなら同じ確かめ方で題名が見える（＝対照）ことで確かめる。
 */

const stamp = () => Date.now().toString(36)

async function anonymousPage(browser: Browser) {
  const context = await browser.newContext()
  return { page: await context.newPage(), close: () => context.close() }
}

const KINDS = [
  { name: 'イベント', create: createEvent, page: (id: string) => `/events/${id}`, api: (id: string) => `/api/v1/events/${id}` },
  { name: '日程調整', create: createPreEvent, page: (id: string) => `/pre-events/${id}`, api: (id: string) => `/api/v1/pre-events/${id}` },
] as const

for (const kind of KINDS) {
  test(`非公開の${kind.name}は、未ログインには中身もメタデータも出ない`, async ({ page, browser }) => {
    await loginMastodon(page, `owner${stamp()}`)
    const secret = { title: `非公開の${kind.name} ${stamp()}`, description: `秘密の説明 ${stamp()}` }
    const hidden = await kind.create(page, { ...secret, isPublic: false })
    const shownTitle = `公開の${kind.name} ${stamp()}`
    const shown = await kind.create(page, { title: shownTitle, description: `公開の説明 ${stamp()}` })

    // 作った本人には見える（空振りしていない）
    await page.goto(kind.page(hidden.id))
    await expect(page.getByText(secret.title).first()).toBeVisible()

    const anon = await anonymousPage(browser)
    try {
      // API は 401
      const res = await anon.page.request.get(kind.api(hidden.id))
      expect(res.status()).toBe(401)

      // 画面にも head にも出ない
      const response = await anon.page.goto(kind.page(hidden.id))
      expect(response?.status()).toBe(200)
      await waitForApiIdle(anon.page)
      expect(await anon.page.content()).not.toContain(secret.title)
      const meta = await metadataText(anon.page)
      expect(meta).not.toContain(secret.title)
      expect(meta).not.toContain(secret.description)

      // 対照: 公開のものは同じ確かめ方で題名が head に出る
      await anon.page.goto(kind.page(shown.id))
      expect(await metadataText(anon.page)).toContain(shownTitle)
    } finally {
      await anon.close()
    }
  })
}
