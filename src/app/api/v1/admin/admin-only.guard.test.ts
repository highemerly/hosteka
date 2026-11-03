import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERSONAS, makeRequest } from '@/test/contract'

/*
  判定を越えてハンドラまで来たら、DB に触れた時点で落とす。
  403 が返ったことに加えて、「中身を1行も読まずに断った」ことを見る。
*/
vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy(
    {},
    {
      get(_, key) {
        throw new Error(`管理者でない人のリクエストで prisma.${String(key)} に触れた`)
      },
    }
  ),
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))

import { getSession, isAdminUser } from '@/server/auth/session'
import { getRouteDefinition, type AuthMode } from '@/server/http/define-route'

/**
 * 管理者でない人は、管理用の API を1本も通れない。
 *
 * **管理画面の中身はすべて管理用の API が返す。** `/admin` 以下のページは
 * データを持たない殻で、誰が開いても 200 になる（CLAUDE.md「レンダリングとキャッシュ」。
 * 画面は API の 403 を受けて「管理者だけ」と案内する）。
 * だから守りはここに一本化されていて、1本でも `auth: 'admin'` を
 * 書き忘れると、管理者向けの情報が誰にでも読める。
 *
 * 仕組み（`defineRoute` が DB で確かめること）は `define-route.test.ts` が見ている。
 * ここは**全ルートがその仕組みに載っているか**を見る。ルートを足したら自動で対象になる。
 */

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

const API_ROOT = join(process.cwd(), 'src', 'app', 'api')
const ADMIN_ROOT = join(API_ROOT, 'v1', 'admin')

/** `/api/v1/admin` の下で、管理者以外の認証モードを意図して使うもの */
const NOT_ADMIN_AUTH: Record<string, { auth: AuthMode; reason: string }> = {
  'purge-old-records/route.ts': {
    auth: 'cron',
    reason: 'k8s の CronJob が叩く。人のログインを持てないので CRON_SECRET で確かめる',
  },
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) return routeFiles(full)
      return name === 'route.ts' ? [full] : []
    })
}

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>

type Endpoint = { file: string; method: (typeof METHODS)[number]; handler: Handler; auth: AuthMode }

async function endpoints(): Promise<Endpoint[]> {
  const found: Endpoint[] = []
  for (const file of routeFiles(API_ROOT)) {
    const routeModule: Record<string, unknown> = await import(pathToFileURL(file).href)
    for (const method of METHODS) {
      const definition = getRouteDefinition(routeModule[method])
      if (!definition) continue
      found.push({
        file,
        method,
        handler: routeModule[method] as Handler,
        auth: definition.auth,
      })
    }
  }
  return found
}

/** `[id]` のようなパス部分はどれも同じ値で埋める。判定はパラメータより先に走る */
function call({ file, method, handler }: Endpoint): Promise<Response> {
  const path = '/' + relative(join(process.cwd(), 'src', 'app'), file).replace(/\/route\.ts$/, '')
  const params = Object.fromEntries(
    [...path.matchAll(/\[(\w+)\]/g)].map(([, name]) => [name, 'target_1'])
  )
  const request = makeRequest(
    path.replace(/\[\w+\]/g, 'target_1'),
    method === 'GET' || method === 'DELETE' ? { method } : { method, body: {} }
  )
  return handler(request, { params: Promise.resolve(params) })
}

const label = (e: Endpoint) => `${e.method} ${relative(API_ROOT, e.file)}`

const mockGetSession = vi.mocked(getSession)
const mockIsAdmin = vi.mocked(isAdminUser)

beforeEach(() => {
  mockGetSession.mockReset()
  mockIsAdmin.mockReset()
})

describe('管理用 API の宣言', () => {
  it('/api/v1/admin の下は、除外したものを除いてすべて auth: admin', async () => {
    const admin = (await endpoints()).filter((e) => e.file.startsWith(ADMIN_ROOT + '/'))
    expect(admin.length).toBeGreaterThan(0)

    for (const e of admin) {
      const expected = NOT_ADMIN_AUTH[relative(ADMIN_ROOT, e.file)]?.auth ?? 'admin'
      expect(e.auth, label(e)).toBe(expected)
    }
  })

  it('除外の一覧に、もう無いルートが残っていない', () => {
    const files = routeFiles(ADMIN_ROOT).map((f) => relative(ADMIN_ROOT, f))
    for (const file of Object.keys(NOT_ADMIN_AUTH)) {
      expect(files, file).toContain(file)
    }
  })
})

describe('管理者でない人のリクエスト', () => {
  /** `/api/v1/admin` の外にある管理者専用ルート（一括の自動キャンセルなど）も含める */
  const adminOnly = async () => (await endpoints()).filter((e) => e.auth === 'admin')

  it('一般ユーザーはすべて 403。DB に触れずに断る', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    mockIsAdmin.mockResolvedValue(false)

    for (const e of await adminOnly()) {
      const res = await call(e)
      expect(res.status, label(e)).toBe(403)
      expect((await res.json()).error.code, label(e)).toBe('FORBIDDEN')
    }
  })

  it('トークンが管理者と言っていても、DB が否定すれば 403（権限の剥奪がすぐ効く）', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.admin)
    mockIsAdmin.mockResolvedValue(false)

    for (const e of await adminOnly()) {
      expect((await call(e)).status, label(e)).toBe(403)
    }
    expect(mockIsAdmin).toHaveBeenCalledWith('admin_1')
  })

  it('未ログインはすべて 401', async () => {
    mockGetSession.mockResolvedValue(null)

    for (const e of await adminOnly()) {
      expect((await call(e)).status, label(e)).toBe(401)
    }
  })
})
