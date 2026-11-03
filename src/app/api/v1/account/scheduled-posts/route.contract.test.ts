import { describe, it, vi, beforeEach, expect, afterEach } from 'vitest'

import { PERSONAS, expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))

/*
  宛先の確認（`remoteFetch` が毎回呼ぶ）は名前を引く。モックしないと
  テストが DNS に依存する。判定そのものは `outbound-host.test.ts` が見ている。
*/
vi.mock('@/server/auth/outbound-host', () => ({ checkOutboundHost: async () => null }))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))
vi.mock('@/lib/crypto', () => ({
  decryptAccessToken: (value: string | null | undefined) => (value ? 'plain-token' : null),
}))

import { getSession } from '@/server/auth/session'
import { GET } from './route'

const mockGetSession = vi.mocked(getSession)

const MASTODON_ROW = {
  id: '1',
  scheduled_at: '2026-09-20T10:00:00.000Z',
  params: { text: 'あしたの交流会のリマインドです', visibility: 'unlisted' },
  media_attachments: [{ id: 'm1' }],
}

function mockUpstream(init: { status?: number; body?: unknown } = {}) {
  const { status = 200, body = [] } = init
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    )
  )
}

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(PERSONAS.user)
  prismaMock.user.findUnique.mockResolvedValue({ accessToken: 'enc:v1:SECRET' })
  mockUpstream({ body: [MASTODON_ROW] })
})

afterEach(() => vi.unstubAllGlobals())

describe('GET /api/v1/account/scheduled-posts', () => {
  it('画面が使う形だけに絞って返す', async () => {
    await expectContract(await GET(makeRequest('/api/v1/account/scheduled-posts')))
  })

  it('トークンはブラウザへ返さない。相手のサーバーはここが叩く', async () => {
    const response = await GET(makeRequest('/api/v1/account/scheduled-posts'))
    const body = JSON.stringify(await response.json())
    expect(body).not.toContain('plain-token')
    expect(body).not.toContain('enc:v1:SECRET')

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://example.social/api/v1/scheduled_statuses?limit=40')
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Bearer plain-token' })
  })

  it('未ログインでは401', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.anonymous)
    await expectContract(await GET(makeRequest('/api/v1/account/scheduled-posts')))
  })

  it('Mastodon 以外はその旨を返す。エラーにしない（入り直しても直らない）', async () => {
    mockGetSession.mockResolvedValue({
      ...PERSONAS.user,
      user: { ...PERSONAS.user.user, platform: 'discord' },
    })
    await expectContract(await GET(makeRequest('/api/v1/account/scheduled-posts')))
  })

  it('トークンが無ければ「権限が無い」を返す。入り直せば直ると画面が言える', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ accessToken: null })
    await expectContract(await GET(makeRequest('/api/v1/account/scheduled-posts')))
  })

  it('相手が403でも同じ。トークンはあるが権限が足りない', async () => {
    mockUpstream({ status: 403, body: { error: 'forbidden' } })
    await expectContract(await GET(makeRequest('/api/v1/account/scheduled-posts')))
  })

  it('相手が落ちているときは503。こちらの不具合ではない', async () => {
    mockUpstream({ status: 500, body: {} })
    await expectContract(await GET(makeRequest('/api/v1/account/scheduled-posts')))
  })
})
