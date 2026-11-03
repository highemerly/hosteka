import { expect, type Page } from '@playwright/test'

/** 偽 Fediverse サーバーの管理用の口（e2e/fakeverse/server.mjs） */
const FAKEVERSE_ADMIN = process.env.FAKEVERSE_ADMIN ?? 'http://localhost:58080'

export type Received = {
  host: string
  method: string
  path: string
  query: Record<string, string>
  authorization: string | null
  json: Record<string, unknown>
}

export const fakeverse = {
  async reset() {
    await fetch(`${FAKEVERSE_ADMIN}/reset`, { method: 'POST' })
  },
  async received(filter: Partial<Pick<Received, 'host' | 'method' | 'path'>> = {}): Promise<Received[]> {
    const all = (await (await fetch(`${FAKEVERSE_ADMIN}/received`)).json()) as Received[]
    return all.filter((r) => Object.entries(filter).every(([k, v]) => r[k as keyof Received] === v))
  },
  /** そのエンドポイントだけ、決めたステータスで応答させる（`status` を省くと元に戻す） */
  async override(host: string, method: string, path: string, status?: number) {
    await fetch(`${FAKEVERSE_ADMIN}/override`, { method: 'POST', body: JSON.stringify({ host, method, path, status }) })
  },
  async misskeyNextUser(username: string) {
    await fetch(`${FAKEVERSE_ADMIN}/misskey-next-user`, { method: 'POST', body: JSON.stringify({ username }) })
  },
}

/**
 * ページ内から same-origin の fetch を呼ぶ。**Cookie はブラウザに任せる**
 * （本番の Cookie は Secure 付きで、localhost を安全な接続として扱うのはブラウザだけ）。
 */
export async function call<T = unknown>(
  page: Page,
  method: string,
  path: string,
  json?: unknown
): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ method, path, json }) => {
      const res = await fetch(path, {
        method,
        headers: json === undefined ? {} : { 'Content-Type': 'application/json' },
        body: json === undefined ? undefined : JSON.stringify(json),
      })
      const text = await res.text()
      return { status: res.status, body: text ? JSON.parse(text) : null }
    },
    { method, path, json }
  )
}

/** ログイン後の画面が戻ってきた先。エラー画面なら失敗 */
async function expectLoggedIn(page: Page) {
  expect(new URL(page.url()).pathname).not.toMatch(/^\/auth\/error/)
  const res = await call(page, 'GET', '/api/v1/dashboard')
  expect(res.status, 'ログインできていない').toBe(200)
}

/**
 * Mastodon でログインする。認可画面は通さず、認可 URL の redirect_uri と state から
 * コールバックを直接開く（偽サーバーの token は `e2e-<ユーザー名>` の code を受け付ける）。
 */
export async function loginMastodon(page: Page, username: string, { write = true } = {}) {
  await page.goto('/')
  const res = await call<{ data: { authUrl: string } }>(page, 'POST', '/api/v1/auth/mastodon/register', {
    server: 'mastodon.test',
    callbackUrl: '/dashboard',
    termsAccepted: true,
    requestWritePermission: write,
  })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  const authUrl = new URL(res.body.data.authUrl)
  const callback = new URL(authUrl.searchParams.get('redirect_uri')!)
  callback.searchParams.set('code', `e2e-${username}`)
  callback.searchParams.set('state', authUrl.searchParams.get('state')!)
  await page.goto(callback.toString())
  await expectLoggedIn(page)
  return authUrl
}

/** Misskey でログインする。MiAuth の callback に、署名入りのコールバック URL がそのまま入っている */
export async function loginMisskey(page: Page, username: string, { write = true } = {}) {
  await fakeverse.misskeyNextUser(username)
  await page.goto('/')
  const res = await call<{ data: { authUrl: string } }>(page, 'POST', '/api/v1/auth/misskey/register', {
    server: 'misskey.test',
    callbackUrl: '/dashboard',
    termsAccepted: true,
    requestWritePermission: write,
  })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  const authUrl = new URL(res.body.data.authUrl)
  await page.goto(authUrl.searchParams.get('callback')!)
  await expectLoggedIn(page)
  return authUrl
}

/** イベントを作る。画面のフォームが送るのと同じ形（`eventFormSchema`） */
export async function createEvent(page: Page, fields: { title: string; description?: string; isPublic?: boolean }) {
  const res = await call<{ data: { id: string; creator: { id: string } } }>(page, 'POST', '/api/v1/events', {
    title: fields.title,
    description: fields.description ?? '',
    hashtags: [],
    startDate: '2030-01-15',
    startTime: '19:00',
    endTime: '',
    location: '',
    fee: '',
    relatedUrl: '',
    terms: '',
    registrationDeadlineTime: '',
    isAllowedForFediverse: true,
    isAllowedForDiscord: true,
    isAllowedForTwitter: true,
    // サーバーを指定すると本物の anypost.dev へ種別を問い合わせるので、指定しない
    allowedFediverseServers: [],
    isPublic: fields.isPublic ?? true,
    isHighlighted: true,
    allowMaybe: true,
    allowParticipationRequest: false,
    optionGroups: [],
  })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return res.body.data
}

/** 日程調整を作る。画面が送るのと同じ形（`preEventPayloadSchema`） */
export async function createPreEvent(page: Page, fields: { title: string; description?: string; isPublic?: boolean }) {
  const res = await call<{ data: { id: string } }>(page, 'POST', '/api/v1/pre-events', {
    title: fields.title,
    description: fields.description ?? '',
    location: '',
    fee: '',
    terms: '',
    relatedUrl: '',
    dateOptions: [{ startDate: '2030-02-01T10:00:00.000Z', endDate: null }],
    registrationDeadline: null,
    isAllowedForFediverse: true,
    isAllowedForDiscord: true,
    isAllowedForTwitter: true,
    allowedFediverseServers: [],
    allowAutoRegistration: false,
    isPublic: fields.isPublic ?? true,
    isHighlighted: true,
  })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return res.body.data
}

/**
 * 自分の API（`/api/`）への問い合わせが無くなって、少し経つまで待つ。
 * `networkidle` は使わない — 開いたままの通信があるページでは来ない。
 */
export async function waitForApiIdle(page: Page, { quietMs = 500, timeoutMs = 15_000 } = {}) {
  let inflight = 0
  let lastChange = Date.now()
  const isApi = (url: string) => new URL(url).pathname.startsWith('/api/')
  const start = (r: { url(): string }) => {
    if (isApi(r.url())) {
      inflight++
      lastChange = Date.now()
    }
  }
  const end = (r: { url(): string }) => {
    if (isApi(r.url())) {
      inflight = Math.max(0, inflight - 1)
      lastChange = Date.now()
    }
  }
  page.on('request', start)
  page.on('requestfinished', end)
  page.on('requestfailed', end)
  try {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (inflight === 0 && Date.now() - lastChange >= quietMs) return
      await page.waitForTimeout(100)
    }
    throw new Error(`${page.url()} で API の問い合わせが終わらない（${inflight} 件）`)
  } finally {
    page.off('request', start)
    page.off('requestfinished', end)
    page.off('requestfailed', end)
  }
}

/**
 * ページを開き、JS の未捕捉の例外と CSP 違反が無いことを見る。
 * **コンソールのエラー全般は見ない**（ブラウザ拡張や外部の要因で揺れる）。
 */
export async function openCleanly(page: Page, path: string) {
  const errors: string[] = []
  const onError = (e: Error) => errors.push(`${e.name}: ${e.message}`)
  page.on('pageerror', onError)
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const w = window as unknown as { __csp?: string[] }
      ;(w.__csp ??= []).push(`${e.violatedDirective} ${e.blockedURI}`)
    })
  })
  try {
    const res = await page.goto(path)
    expect(res?.status(), `${path} のステータス`).toBe(200)
    // 中身はクライアントが API から取る。取り終わるまで待ってから例外を見る
    await waitForApiIdle(page)
    const csp = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])
    expect(errors, `${path} で JS の例外`).toEqual([])
    expect(csp, `${path} で CSP 違反`).toEqual([])
  } finally {
    page.off('pageerror', onError)
  }
}

/** HTML の head に出ているメタデータ（題名・説明・OGP） */
export async function metadataText(page: Page): Promise<string> {
  return page.evaluate(() =>
    [
      document.title,
      ...Array.from(document.querySelectorAll('meta[name="description"], meta[property^="og:"], meta[name^="twitter:"]')).map(
        (m) => m.getAttribute('content') ?? ''
      ),
    ].join('\n')
  )
}
