import 'server-only'

import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import { z } from 'zod'

import { ERROR_CODES } from '@/server/http/errors'
import { getRouteDefinition, type RouteDefinition } from '@/server/http/define-route'

/**
 * `/api` の契約書（OpenAPI）を組み立てる。
 *
 * **入力だけを載せる。** 応答の形は TypeScript の型で書かれていて Zod ではなく、
 * 契約としては contract テストのスナップショット（79件）が既に固定している。
 * 両方に書くと、片方だけ直した日に嘘の契約書ができる。ここに載せる応答は
 * `defineRoute` 自身が返すもの（エンベロープとエラー）に限る。
 *
 * **ルートの定義は `defineRoute` から読む。** パスとメソッドはファイルの
 * 置き場から分かるが、入力の Zod スキーマと認証モードはそこにしか無い
 * （`getRouteDefinition`）。手で一覧を書くと、足したルートが載らない。
 *
 * `defineRoute` に載っていないルート（`health` と認証系8本）は**意図して
 * 載せない。** リダイレクトと Cookie が仕事でエンベロープを返さないため。
 * その一覧は `src/server/http/define-route.guard.test.ts` が固定する。
 */

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

const API_ROOT = join(process.cwd(), 'src', 'app', 'api')

export type OpenApiDocument = Record<string, unknown>

export type BuildResult = {
  document: OpenApiDocument
  /** JSON Schema に変換できなかったスキーマ。**空でなければ契約に穴が開く** */
  unconvertible: string[]
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

/** `src/app/api/v1/events/[id]/route.ts` → `/api/v1/events/{id}` */
export function urlPathOf(file: string): string {
  const rel = relative(join(process.cwd(), 'src', 'app'), file)
  const segments = rel.split(sep).slice(0, -1) // route.ts を落とす
  return (
    '/' +
    segments.map((s) => (s.startsWith('[') && s.endsWith(']') ? `{${s.slice(1, -1)}}` : s)).join('/')
  )
}

/**
 * Zod を JSON Schema へ。**`io: 'input'` で変換する** — ここで書きたいのは
 * 「クライアントが送ってよい形」であって、サーバーが受け取ったあとの形ではない
 * （`z.coerce` や `.default()` は両者で姿が変わる）。
 */
function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >
  // OpenAPI 3.1 の中では方言の宣言は要らない。項目ごとに繰り返されると差分が読めない
  delete json.$schema
  return json
}

type Parameter = {
  name: string
  in: 'path' | 'query'
  required: boolean
  schema: Record<string, unknown>
}

/** オブジェクトのスキーマを、1項目ずつのパラメータに割る */
function parametersFrom(
  schema: z.ZodType | undefined,
  location: 'path' | 'query',
  label: string,
  unconvertible: string[]
): Parameter[] {
  if (!schema) return []

  let json: Record<string, unknown>
  try {
    json = toJsonSchema(schema)
  } catch {
    unconvertible.push(label)
    return []
  }

  const properties = (json.properties ?? {}) as Record<string, Record<string, unknown>>
  const required = new Set((json.required ?? []) as string[])

  return Object.entries(properties).map(([name, value]) => ({
    name,
    in: location,
    // パスパラメータは常に必須（URL に現れる以上、省けない）
    required: location === 'path' ? true : required.has(name),
    schema: value,
  }))
}

/**
 * `defineRoute` 自身が返しうるエラー。**ハンドラが投げる個別のエラーは載せない**
 * （どのルートも `ApiError` を投げうるので、全部書くと意味が薄れる）。
 */
const ERROR_RESPONSE_SPECS = [
  ['UNAUTHENTICATED', 'ログインしていない。Cookie が無いか失効している'],
  ['FORBIDDEN', '権限がない。管理者かどうかは毎回 DB で確かめる'],
  ['VALIDATION_ERROR', '入力がスキーマに合わない。`details` に項目ごとの理由が入る'],
  ['INTERNAL', '想定外の例外'],
  ['SERVICE_UNAVAILABLE', 'DB 接続断など、再試行する価値のある失敗'],
] as const satisfies readonly (readonly [keyof typeof ERROR_CODES, string])[]

type ErrorName = (typeof ERROR_RESPONSE_SPECS)[number][0]

function errorNamesFor(definition: RouteDefinition): ErrorName[] {
  const names: ErrorName[] = []
  if (definition.auth === 'required' || definition.auth === 'admin' || definition.auth === 'cron')
    names.push('UNAUTHENTICATED')
  if (definition.auth === 'admin') names.push('FORBIDDEN')
  if (definition.params || definition.query || definition.body) names.push('VALIDATION_ERROR')
  names.push('INTERNAL', 'SERVICE_UNAVAILABLE')
  return names
}

function operationFor(definition: RouteDefinition, label: string, unconvertible: string[]) {
  const parameters = [
    ...parametersFrom(definition.params, 'path', `${label} params`, unconvertible),
    ...parametersFrom(definition.query, 'query', `${label} query`, unconvertible),
  ]

  let requestBody: Record<string, unknown> | undefined
  if (definition.body) {
    try {
      requestBody = {
        required: true,
        content: { 'application/json': { schema: toJsonSchema(definition.body) } },
      }
    } catch {
      unconvertible.push(`${label} body`)
    }
  }

  const responses: Record<string, unknown> = {
    '200': {
      description: '成功。単体は `{ data }`、一覧は `{ data, meta }`',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Envelope' } } },
    },
  }
  // 同じ塊を繰り返さない。参照にしておくと、契約が変わった差分だけがレビューに出る
  for (const name of errorNamesFor(definition)) {
    responses[String(ERROR_CODES[name])] = { $ref: `#/components/responses/${name}` }
  }

  return {
    // 認証モードは `defineRoute` の宣言そのもの。admin は DB で確認される
    'x-auth': definition.auth,
    ...(definition.publicCache ? { 'x-public-cache': definition.publicCache } : {}),
    ...(parameters.length ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses,
    ...(definition.auth === 'none'
      ? {}
      : definition.auth === 'cron'
        ? { security: [{ cronToken: [] }] }
        : { security: [{ sessionCookie: [] }] }),
  }
}

const COMPONENTS = {
  responses: Object.fromEntries(
    ERROR_RESPONSE_SPECS.map(([name, description]) => [
      name,
      {
        description,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
        },
      },
    ])
  ),
  securitySchemes: {
    cronToken: {
      type: 'http',
      scheme: 'bearer',
      description: '定期実行用の合言葉（CRON_SECRET）。人のログインを持たない cron 用',
    },
    sessionCookie: {
      type: 'apiKey',
      in: 'cookie',
      name: '__Host-ht-session',
      description: 'httpOnly のセッション Cookie。認証の真実はこれだけ。開発環境では `__Host-` が付かない',
    },
  },
  schemas: {
    Envelope: {
      type: 'object',
      required: ['data'],
      properties: {
        data: { description: '本体。形はルートごとに違う' },
        meta: { $ref: '#/components/schemas/Meta' },
      },
    },
    Meta: {
      type: 'object',
      required: ['total', 'page', 'perPage', 'totalPages'],
      properties: {
        total: { type: 'integer' },
        page: { type: 'integer' },
        perPage: { type: 'integer' },
        totalPages: { type: 'integer' },
      },
    },
    ErrorEnvelope: {
      type: 'object',
      required: ['error'],
      properties: {
        error: {
          type: 'object',
          required: ['code', 'message', 'requestId'],
          properties: {
            code: { type: 'string', enum: Object.keys(ERROR_CODES).sort() },
            message: { type: 'string', description: '日本語のユーザー向け文言' },
            requestId: { type: 'string' },
            details: {
              type: 'array',
              items: {
                type: 'object',
                required: ['path', 'message'],
                properties: { path: { type: 'string' }, message: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  },
}

export async function buildOpenApi(): Promise<BuildResult> {
  const unconvertible: string[] = []
  const paths: Record<string, Record<string, unknown>> = {}

  for (const file of routeFiles(API_ROOT)) {
    const routeModule: Record<string, unknown> = await import(pathToFileURL(file).href)
    const urlPath = urlPathOf(file)

    for (const method of METHODS) {
      const definition = getRouteDefinition(routeModule[method])
      // `defineRoute` に載っていないルートは載せない（意図的な除外）
      if (!definition) continue

      const label = `${method} ${urlPath}`
      paths[urlPath] ??= {}
      paths[urlPath][method.toLowerCase()] = operationFor(definition, label, unconvertible)
    }
  }

  const document: OpenApiDocument = {
    openapi: '3.1.0',
    info: {
      title: 'Hosteka API',
      version: '1',
      description:
        'イベント管理プラットフォームの内部API。応答の本体（`data`）の形は各ルートの DTO と' +
        ' contract テストのスナップショットが持つ。ここに載るのは入力と、`defineRoute` が' +
        '返すエンベロープ・エラーまで。',
    },
    paths: Object.fromEntries(Object.entries(paths).sort(([a], [b]) => (a < b ? -1 : 1))),
    components: COMPONENTS,
  }

  return { document, unconvertible: unconvertible.sort() }
}
