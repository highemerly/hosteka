import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextResponse } from 'next/server'
import { z } from 'zod'

vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))

import { getSession, isAdminUser } from '@/server/auth/session'
import { makeRequest } from '@/test/contract'
import { PERSONAS } from '@/test/contract'

import { defineRoute } from './define-route'
import { ApiError } from './errors'

const mockGetSession = vi.mocked(getSession)
const mockIsAdmin = vi.mocked(isAdminUser)

beforeEach(() => {
  mockGetSession.mockReset()
  mockIsAdmin.mockReset()
})

async function json(res: Response) {
  return { status: res.status, body: await res.json() }
}

describe('認証モード', () => {
  const route = (auth: 'none' | 'optional' | 'required' | 'admin') =>
    defineRoute({ auth, handler: async ({ session }) => ({ userId: session?.user.id ?? null }) })

  it('none: セッション解決すら行わない', async () => {
    const res = await route('none')(makeRequest('/x'))
    expect(await json(res)).toEqual({ status: 200, body: { data: { userId: null } } })
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('optional: 未ログインでも通る', async () => {
    mockGetSession.mockResolvedValue(null)
    expect((await json(await route('optional')(makeRequest('/x')))).status).toBe(200)
  })

  it('required: 未ログインは401（403ではない）', async () => {
    mockGetSession.mockResolvedValue(null)
    const { status, body } = await json(await route('required')(makeRequest('/x')))
    expect(status).toBe(401)
    expect(body.error.code).toBe('UNAUTHENTICATED')
  })

  it('required: ログイン済みは通る', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    const { body } = await json(await route('required')(makeRequest('/x')))
    expect(body.data.userId).toBe('user_1')
  })

  // トークンの adm は陳腐化しうるヒントに過ぎない。権限剥奪が即座に効くよう
  // 管理者判定は必ずDBで確認する。ここが崩れると剥奪が反映されなくなる。
  it('admin: isAdmin を必ずDBで確認する', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.admin)
    mockIsAdmin.mockResolvedValue(true)
    expect((await json(await route('admin')(makeRequest('/x')))).status).toBe(200)
    expect(mockIsAdmin).toHaveBeenCalledWith('admin_1')
  })

  it('admin: セッションが管理者でもDBが否定すれば403', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.admin)
    mockIsAdmin.mockResolvedValue(false)
    const { status, body } = await json(await route('admin')(makeRequest('/x')))
    expect(status).toBe(403)
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('admin: 未ログインは401', async () => {
    mockGetSession.mockResolvedValue(null)
    expect((await json(await route('admin')(makeRequest('/x')))).status).toBe(401)
  })
})

describe('入力の検証', () => {
  it('クエリの不正は400 + details', async () => {
    const route = defineRoute({
      auth: 'none',
      query: z.object({ page: z.coerce.number().int().min(1) }),
      handler: async ({ query }) => query,
    })
    const { status, body } = await json(await route(makeRequest('/x?page=0')))
    expect(status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details[0].path).toBe('page')
  })

  it('クエリは型変換されてハンドラに渡る', async () => {
    const route = defineRoute({
      auth: 'none',
      query: z.object({ page: z.coerce.number() }),
      handler: async ({ query }) => query,
    })
    expect((await json(await route(makeRequest('/x?page=3')))).body.data).toEqual({ page: 3 })
  })

  it('壊れたJSONボディは400', async () => {
    const route = defineRoute({
      auth: 'none',
      body: z.object({ a: z.string() }),
      handler: async ({ body }) => body,
    })
    const req = makeRequest('/x', { method: 'POST' })
    Object.defineProperty(req, 'json', { value: async () => { throw new Error('bad') } })
    expect((await json(await route(req))).status).toBe(400)
  })

  it('パスパラメータを検証する', async () => {
    const route = defineRoute({
      auth: 'none',
      params: z.object({ id: z.string().min(3) }),
      handler: async ({ params }) => params,
    })
    const res = await route(makeRequest('/x'), { params: Promise.resolve({ id: 'ab' }) })
    expect((await json(res)).status).toBe(400)
  })
})

describe('ガード', () => {
  it('ガードが投げた ApiError がそのまま返る', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    const route = defineRoute({
      auth: 'required',
      guard: () => { throw ApiError.forbidden('主催者のみ操作できます') },
      handler: async () => ({ ok: true }),
    })
    const { status, body } = await json(await route(makeRequest('/x')))
    expect(status).toBe(403)
    expect(body.error.message).toBe('主催者のみ操作できます')
  })

  it('ガードは認証の後に走る（未ログインならガードに到達しない）', async () => {
    mockGetSession.mockResolvedValue(null)
    const guard = vi.fn()
    const route = defineRoute({ auth: 'required', guard, handler: async () => ({}) })
    expect((await json(await route(makeRequest('/x')))).status).toBe(401)
    expect(guard).not.toHaveBeenCalled()
  })
})

describe('別サイトからの変更（CSRF）', () => {
  const SITE = 'https://hosteka.test'
  const post = (origin?: string) =>
    makeRequest('/x', { method: 'POST', headers: origin === undefined ? {} : { origin } })

  beforeEach(() => {
    vi.stubEnv('NEXTAUTH_URL', `${SITE}/`)
    vi.stubEnv('CRON_SECRET', 'secret')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('別のサイトの Origin は、認証より前に403で断る（ハンドラに届かない）', async () => {
    const handler = vi.fn(async () => ({}))
    const route = defineRoute({ auth: 'none', handler })
    const { status, body } = await json(await route(post('https://evil.example')))
    expect(status).toBe(403)
    expect(body.error.code).toBe('FORBIDDEN')
    expect(handler).not.toHaveBeenCalled()
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('Origin: null も断る', async () => {
    const route = defineRoute({ auth: 'none', handler: async () => ({}) })
    expect((await json(await route(post('null')))).status).toBe(403)
  })

  it('自分のサイトの Origin は通る（NEXTAUTH_URL の末尾の / は見ない）', async () => {
    const route = defineRoute({ auth: 'none', handler: async () => ({}) })
    expect((await json(await route(post(SITE)))).status).toBe(200)
  })

  it('Origin の無い要求（ブラウザ以外）は通る', async () => {
    const route = defineRoute({ auth: 'none', handler: async () => ({}) })
    expect((await json(await route(post()))).status).toBe(200)
  })

  it('読むだけの要求は Origin を見ない', async () => {
    const route = defineRoute({ auth: 'none', handler: async () => ({}) })
    const res = await route(makeRequest('/x', { headers: { origin: 'https://evil.example' } }))
    expect((await json(res)).status).toBe(200)
  })

  it('cron は Origin を見ない（合言葉で確かめる）', async () => {
    const route = defineRoute({ auth: 'cron', handler: async () => ({}) })
    const res = await route(
      makeRequest('/x', {
        method: 'POST',
        headers: { origin: 'https://evil.example', authorization: 'Bearer secret' },
      })
    )
    expect((await json(res)).status).toBe(200)
  })
})

describe('エラー変換', () => {
  it('想定外の例外は500に潰し、内部情報を漏らさない', async () => {
    const route = defineRoute({
      auth: 'none',
      handler: async () => { throw new Error('column "secret_token" does not exist') },
    })
    const { status, body } = await json(await route(makeRequest('/x')))
    expect(status).toBe(500)
    expect(body.error.code).toBe('INTERNAL')
    expect(JSON.stringify(body)).not.toContain('secret_token')
  })

  it('DB接続断は503（再試行する価値があることを伝える）', async () => {
    const route = defineRoute({
      auth: 'none',
      // isDatabaseConnectionError はメッセージパターンでも判定する。
      // P2024 は Prisma の例外クラス経由でのみ拾われるため、ここでは
      // 素の Error で確実に一致する文言を使う。
      handler: async () => {
        throw new Error("Can't reach database server at localhost:5432")
      },
    })
    const { status, body } = await json(await route(makeRequest('/x')))
    expect(status).toBe(503)
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('エラーには requestId が付く', async () => {
    const route = defineRoute({ auth: 'none', handler: async () => { throw new Error('x') } })
    const { body } = await json(await route(makeRequest('/x')))
    expect(body.error.requestId).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('レスポンス', () => {
  it('戻り値は data で包まれる', async () => {
    const route = defineRoute({ auth: 'none', handler: async () => ({ a: 1 }) })
    expect((await json(await route(makeRequest('/x')))).body).toEqual({ data: { a: 1 } })
  })

  /*
    **素の `Response` も同じように通ること。**
    以前は `instanceof NextResponse` で見ていたので、`new Response(csv)` を
    返していた日程調整のCSV出力だけが `{"data":{}}` という JSON に包まれ、
    ダウンロードしても中身が無かった（`Response` を JSON 化すると空になる）。
    ルート側の書き方に依存させると、この事故は静かに再発する。
  */
  it.each([
    ['NextResponse', (body: string) => new NextResponse(body, { headers: { 'content-type': 'text/csv' } })],
    ['Response', (body: string) => new Response(body, { headers: { 'content-type': 'text/csv' } })],
  ])('%s をそのまま返せる（CSV・ICS等）', async (_name, make) => {
    const route = defineRoute({ auth: 'none', handler: async () => make('a,b\n1,2') })
    const res = await route(makeRequest('/x'))
    expect(res.headers.get('content-type')).toBe('text/csv')
    expect(await res.text()).toBe('a,b\n1,2')
  })
})

describe('公開キャッシュ', () => {
  it('既定はキャッシュさせない。ルート自身がヘッダを宣言する', async () => {
    /*
      `next.config.ts` が `/api/*` に同じものを被せているが、公開キャッシュを
      許した例外パスはその網から外れる。ルートが黙っていると、そこだけ
      **何のヘッダも付かないURL**になる。
    */
    const plain = defineRoute({ auth: 'none', handler: async () => ({ a: 1 }) })
    expect((await plain(makeRequest('/x'))).headers.get('Cache-Control')).toBe(
      'private, no-store'
    )
  })

  it('publicCache を渡すと公開キャッシュ可能なヘッダになる', async () => {
    const cached = defineRoute({
      auth: 'none',
      publicCache: { sMaxAge: 300, staleWhileRevalidate: 600 },
      handler: async () => ({ a: 1 }),
    })
    const res = await cached(makeRequest('/x'))
    expect(res.headers.get('Cache-Control')).toBe(
      'public, s-maxage=300, stale-while-revalidate=600'
    )
    expect(res.headers.get('Vary')).toBe('Accept-Encoding')
  })

  it('失敗した応答には付かない。500 を配り続けない', async () => {
    const route = defineRoute({
      auth: 'none',
      publicCache: { sMaxAge: 300, staleWhileRevalidate: 600 },
      handler: async () => {
        throw new Error('boom')
      },
    })
    const res = await route(makeRequest('/x'))

    expect(res.status).toBe(500)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  /*
    **セッションを読むルートには型で付けられない。**
    ここが通ってしまうと「他人の応答が CDN から配られる」に直結する。
    実行時ではなく型で止めているので、テストも型で見る。
  */
  it('auth が none 以外のルートには渡せない（型で落ちる）', () => {
    defineRoute({
      auth: 'required',
      // @ts-expect-error 閲覧者ごとに変わる応答は公開キャッシュに載せられない
      publicCache: { sMaxAge: 300, staleWhileRevalidate: 600 },
      handler: async () => ({ a: 1 }),
    })
    defineRoute({
      auth: 'optional',
      // @ts-expect-error 未ログインでも中身が変わりうる
      publicCache: { sMaxAge: 300, staleWhileRevalidate: 600 },
      handler: async () => ({ a: 1 }),
    })
    expect(true).toBe(true)
  })
})
