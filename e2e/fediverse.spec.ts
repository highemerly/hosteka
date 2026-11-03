import { expect, test } from '@playwright/test'

import { call, createEvent, createPreEvent, fakeverse, loginMastodon, loginMisskey, openCleanly } from './support'

/**
 * 偽の Fediverse サーバー（e2e/fakeverse/server.mjs）相手に、ログインと投稿を通す。
 * 偽サーバーは受けたリクエストを記録するので、**本物のクライアントが送るものと同じものが
 * 届いたか**を見る。画面の操作はしない（ページ内の fetch と page.goto だけ）。
 *
 * Discord と X は宛先が固定（discord.com・api.x.com）で、偽サーバーに向けるには本番の
 * コードに抜け道が要るので、ここでは確かめない。
 */

const stamp = () => Date.now().toString(36)

test.beforeEach(async () => {
  await fakeverse.reset()
})

test.describe('ログイン', () => {
  test('Mastodon: 認可コードでトークンを取り、プロフィールを同期する。アプリは使い回す', async ({ page }) => {
    const user = `alice${stamp()}`
    await loginMastodon(page, user)

    // アプリは「サーバー・コールバック先・権限」の組ごとに1つ登録し、DB に置いて使い回す
    // （ログインのたびに登録すると、利用者の「認証済みアプリ」に Hosteka が並ぶ）。
    // 前のテストで登録済みなら、ここでは登録せず、まだ有効かだけを確かめる
    const apps = await fakeverse.received({ host: 'mastodon.test', path: '/api/v1/apps' })
    expect(apps.length).toBeLessThanOrEqual(1)
    for (const app of apps) {
      expect(app.json).toMatchObject({ client_name: 'Hosteka', redirect_uris: 'http://localhost:3000/api/v1/auth/callback/mastodon' })
    }

    const token = (await fakeverse.received({ host: 'mastodon.test', path: '/oauth/token' })).find(
      (r) => r.json.grant_type === 'authorization_code'
    )
    expect(token?.json).toMatchObject({ code: `e2e-${user}`, redirect_uri: 'http://localhost:3000/api/v1/auth/callback/mastodon' })

    const [me] = await fakeverse.received({ host: 'mastodon.test', path: '/api/v1/accounts/verify_credentials' })
    expect(me.authorization).toMatch(/^Bearer mastodon-token-/)

    // 相手のサーバーの表示名が同期されている
    const profile = await call<{ data: { user: { displayName: string } } }>(page, 'GET', `/api/v1/users/${user}@mastodon.test`)
    expect(profile.body.data.user.displayName).toBe(`${user} (E2E)`)

    // 入り直しても、アプリを登録し直さない
    await fakeverse.reset()
    await page.context().clearCookies()
    await loginMastodon(page, user)
    expect(await fakeverse.received({ host: 'mastodon.test', path: '/api/v1/apps' })).toHaveLength(0)
  })

  test('Misskey: MiAuth のセッションを確かめ、トークンでプロフィールを同期する', async ({ page }) => {
    const user = `mika${stamp()}`
    await loginMisskey(page, user)

    expect(await fakeverse.received({ host: 'misskey.test', path: '/api/meta' })).toHaveLength(1)
    const checks = (await fakeverse.received({ host: 'misskey.test' })).filter((r) => /^\/api\/miauth\/[^/]+\/check$/.test(r.path))
    expect(checks).toHaveLength(1)
    const [me] = await fakeverse.received({ host: 'misskey.test', path: '/api/i' })
    expect(me.json.i).toMatch(/^misskey-token-/)

    const profile = await call<{ data: { user: { displayName: string } } }>(page, 'GET', `/api/v1/users/${user}@misskey.test`)
    expect(profile.body.data.user.displayName).toBe(`${user} (E2E)`)
  })

  /*
    MiAuth は承認のたびに新しいトークンを作る。前のトークンを失効させないと、
    利用者の「連携アプリ」に Hosteka がログインの回数だけ並ぶ。
  */
  test('Misskey: 入り直すと、前のトークンを失効させる', async ({ page }) => {
    const user = `mika${stamp()}`
    await loginMisskey(page, user)
    const first = (await fakeverse.received({ host: 'misskey.test', path: '/api/i' }))[0].json.i
    await loginMisskey(page, user)
    const second = (await fakeverse.received({ host: 'misskey.test', path: '/api/i' }))[1].json.i
    expect(second).not.toBe(first)

    const revokes = await fakeverse.received({ host: 'misskey.test', path: '/api/i/revoke-token' })
    expect(revokes.map((r) => r.json.token)).toEqual([first])
  })
})

test.describe('権限の頼み方', () => {
  test('Mastodon: 読み取りだけなら投稿の権限を頼まず、投稿もできるなら頼む', async ({ page }) => {
    const readOnly = await loginMastodon(page, `reader${stamp()}`, { write: false })
    expect(readOnly.searchParams.get('scope')).toBe('read:accounts')

    await page.context().clearCookies()
    const writer = await loginMastodon(page, `writer${stamp()}`, { write: true })
    expect(writer.searchParams.get('scope')?.split(' ')).toEqual(expect.arrayContaining(['read:accounts', 'write:statuses']))

    // トークンも、頼んだ権限で取る（省くとサーバーによっては読み取りだけになる）
    const tokens = (await fakeverse.received({ host: 'mastodon.test', path: '/oauth/token' })).filter(
      (r) => r.json.grant_type === 'authorization_code'
    )
    expect(tokens.map((t) => t.json.scope)).toEqual([readOnly.searchParams.get('scope'), writer.searchParams.get('scope')])
  })

  test('Misskey: 読み取りだけなら投稿の権限を頼まず、投稿もできるなら頼む', async ({ page }) => {
    const readOnly = await loginMisskey(page, `mreader${stamp()}`, { write: false })
    expect(readOnly.searchParams.get('permission')?.split(',')).not.toContain('write:notes')

    await page.context().clearCookies()
    const writer = await loginMisskey(page, `mwriter${stamp()}`, { write: true })
    expect(writer.searchParams.get('permission')?.split(',')).toContain('write:notes')
  })
})

test.describe('連絡（SNS への投稿）', () => {
  /** 連絡の画面が送るのと同じ形。本文には画面が宛先（メンション）を書き込んでから送る */
  const post = (eventId: string, me: string, message: string, visibility: string) => ({
    eventId,
    message,
    visibility,
    participantIds: [me],
  })

  test('Mastodon: 本文と公開範囲がそのまま届く', async ({ page }) => {
    const user = `poster${stamp()}`
    await loginMastodon(page, user)
    const event = await createEvent(page, { title: `連絡のテスト ${stamp()}` })
    const message = `@${user}@mastodon.test 集合は10時です\nhttp://localhost:3000/events/${event.id}`

    const res = await call(page, 'POST', '/api/v1/events/post-immediate', post(event.id, event.creator.id, message, 'unlisted'))
    expect(res.status, JSON.stringify(res.body)).toBe(200)

    const [status] = await fakeverse.received({ host: 'mastodon.test', path: '/api/v1/statuses' })
    expect(status.authorization).toMatch(/^Bearer mastodon-token-/)
    expect(status.json).toEqual({ status: message, visibility: 'unlisted' })
  })

  test('Misskey: 本文と公開範囲がそのまま届く', async ({ page }) => {
    const user = `mposter${stamp()}`
    await loginMisskey(page, user)
    const event = await createEvent(page, { title: `連絡のテスト ${stamp()}` })
    const message = `@${user}@misskey.test 集合は10時です`

    const res = await call(page, 'POST', '/api/v1/events/post-immediate', post(event.id, event.creator.id, message, 'home'))
    expect(res.status, JSON.stringify(res.body)).toBe(200)

    const [note] = await fakeverse.received({ host: 'misskey.test', path: '/api/notes/create' })
    expect(note.json).toMatchObject({ text: message, visibility: 'home' })
    expect(note.json.i).toMatch(/^misskey-token-/)
  })

  test('Mastodon: 予約投稿の日時が届き、一覧に出て、取り消せる', async ({ page }) => {
    const user = `scheduler${stamp()}`
    await loginMastodon(page, user)
    const event = await createEvent(page, { title: `予約のテスト ${stamp()}` })
    const scheduledFor = '2030-01-14T10:00:00+09:00'

    const res = await call<{ data: { scheduledStatusId: string } }>(page, 'POST', '/api/v1/events/post-scheduled', {
      ...post(event.id, event.creator.id, '明日は10時集合です', 'public'),
      scheduledFor,
    })
    expect(res.status, JSON.stringify(res.body)).toBe(200)

    const [status] = await fakeverse.received({ host: 'mastodon.test', path: '/api/v1/statuses' })
    expect(status.json).toMatchObject({ status: '明日は10時集合です', visibility: 'public', scheduled_at: new Date(scheduledFor).toISOString() })

    const list = await call<{ data: { status: string; posts: { id: string; text: string }[] } }>(page, 'GET', '/api/v1/account/scheduled-posts')
    expect(list.body.data.status).toBe('ok')
    expect(list.body.data.posts.map((p) => p.text)).toEqual(['明日は10時集合です'])

    const id = res.body.data.scheduledStatusId
    const cancel = await call(page, 'DELETE', `/api/v1/account/scheduled-posts/${id}`)
    expect(cancel.status).toBe(200)
    expect(await fakeverse.received({ host: 'mastodon.test', method: 'DELETE', path: `/api/v1/scheduled_statuses/${id}` })).toHaveLength(1)
  })

  /*
    権限で断られたことだけは機械可読にする。画面はそれを見て再ログインへ案内する
    （文言の一致で見分けると、相手のサーバーの文言が変わったときに黙って壊れる）。
  */
  test('Mastodon: 権限で断られたら、権限不足と分かる形で返す', async ({ page }) => {
    await loginMastodon(page, `denied${stamp()}`)
    const event = await createEvent(page, { title: `権限のテスト ${stamp()}` })
    await fakeverse.override('mastodon.test', 'POST', '/api/v1/statuses', 403)

    const res = await call<{ error: { details?: { path: string }[] } }>(
      page,
      'POST',
      '/api/v1/events/post-immediate',
      post(event.id, event.creator.id, 'こんにちは', 'public')
    )
    expect(res.status).toBe(403)
    expect(res.body.error.details?.map((d) => d.path)).toContain('writePermission')
  })
})

test('ログインしてから開くページで、JS の例外が出ない', async ({ page }) => {
  await loginMastodon(page, `browser${stamp()}`)
  const event = await createEvent(page, { title: `画面のテスト ${stamp()}`, description: '**太字**と[リンク](https://example.com)' })
  const preEvent = await createPreEvent(page, { title: `画面のテスト ${stamp()}` })

  for (const path of [
    '/dashboard',
    '/dashboard/my-events',
    '/dashboard/my-pre-events',
    '/dashboard/notifications',
    '/account/sessions',
    '/events/create',
    `/events/${event.id}`,
    `/events/${event.id}/edit`,
    `/events/${event.id}/edit-participants`,
    `/events/${event.id}/contact`,
    '/pre-events/create',
    `/pre-events/${preEvent.id}`,
    `/pre-events/${preEvent.id}/edit`,
  ]) {
    await openCleanly(page, path)
  }
})
