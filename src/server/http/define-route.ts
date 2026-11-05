import 'server-only'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { verifyCronToken } from '@/server/auth/cron-token'
import { getSession, isAdminUser, type Session } from '@/server/auth/session'

import { ApiError } from './errors'
import { errorResponse, toApiError } from './response'
import { crossOriginError, isCrossOriginWrite } from './same-origin'

/**
 * ルートハンドラの共通処理。
 *
 * 現状は61ルートすべてが認証チェック・バリデーション・エラー整形を手書きで
 * 持っており、抜けが目視できない（実際 set-permission-preference は認証チェックが
 * 無く、users/check は無認証で存在確認できる状態だった）。
 * ここに集約することで「書き忘れ」が構造的に起きなくなる。
 */

/**
 * `cron` は人のログインを持たない定期実行用。`CRON_SECRET` を
 * `Authorization: Bearer` で確かめる（`server/auth/cron-token.ts`）。
 * セッションは無いので、ハンドラに渡る `session` は null。
 */
export type AuthMode = 'none' | 'optional' | 'required' | 'admin' | 'cron'

/** ハンドラに渡すコンテキスト。auth モードに応じて session の型が変わる */
export type RouteContext<P, Q, B, A extends AuthMode> = {
  request: NextRequest
  params: P
  query: Q
  body: B
  session: A extends 'required' | 'admin' ? Session : Session | null
  requestId: string
}

export type Guard<P> = (input: {
  params: P
  session: Session
}) => Promise<void> | void

type Schema<T> = z.ZodType<T> | undefined

/**
 * CDN に持たせてよい応答の設定。
 *
 * **`auth: 'none'` のルートにしか付けられない**（下の型で縛る）。
 * セッションを読むルートの応答は閲覧者ごとに違うので、公開キャッシュに
 * 載せると**他人の応答が配られる**。取り返しがつかないので、規約ではなく型で止める。
 *
 * `auth: 'none'` でも、応答が Cookie や `Accept-Language` などで変わるなら
 * 付けてはいけない。**「誰が来ても同じものを返す」ことが条件。**
 */
export type PublicCache = {
  /** CDN が持ってよい秒数（`s-maxage`） */
  sMaxAge: number
  /** 期限切れ後、裏で取り直しながら古い応答を返してよい秒数 */
  staleWhileRevalidate: number
}

type BaseOptions<P, Q, B, A extends AuthMode> = {
  auth: A
  params?: Schema<P>
  query?: Schema<Q>
  body?: Schema<B>
  /**
   * 認証後に走る追加チェック。リソースIDを必要とする権限判定（主催者かどうか等）は
   * ラッパーでは表現できないため、合成可能なガードとして渡す。
   */
  guard?: Guard<P>
  handler: (ctx: RouteContext<P, Q, B, A>) => Promise<unknown>
}

export type DefineRouteOptions<P, Q, B, A extends AuthMode> = BaseOptions<P, Q, B, A> &
  (A extends 'none' ? { publicCache?: PublicCache } : { publicCache?: never })

function issuesOf(error: z.ZodError) {
  return error.issues.map((i) => ({
    path: i.path.join('.') || '(root)',
    message: i.message,
  }))
}

function parseOr<T>(schema: Schema<T>, value: unknown, label: string): T {
  if (!schema) return undefined as T
  const result = schema.safeParse(value)
  if (!result.success) {
    throw ApiError.validation(`${label}の内容が不正です`, issuesOf(result.error))
  }
  return result.data
}

/** Next.js のルートハンドラ第2引数（params は Promise で渡ってくる） */
type RouteArgs = { params?: Promise<Record<string, string>> }

/**
 * ルートに添えた定義を外から読むための印。
 *
 * **契約書（OpenAPI）を書くために要る。** パスとメソッドはファイルの置き場から
 * 分かるが、入力の Zod スキーマと認証モードはここにしか無い。
 * `scripts`/テストから `getRouteDefinition()` で取り出す。
 */
const ROUTE_DEFINITION = Symbol.for('hosteka.routeDefinition')

/** 生成器が読む形。実行時の挙動には一切関わらない */
export type RouteDefinition = {
  auth: AuthMode
  params?: z.ZodType
  query?: z.ZodType
  body?: z.ZodType
  publicCache?: PublicCache
}

/** ルートハンドラに添えた定義を読む。添えていなければ undefined */
export function getRouteDefinition(handler: unknown): RouteDefinition | undefined {
  if (typeof handler !== 'function') return undefined
  return (handler as unknown as Record<symbol, RouteDefinition | undefined>)[ROUTE_DEFINITION]
}

/** 定義をハンドラに添える。**実行時の挙動は何も変えない** */
function withDefinition<P, Q, B, A extends AuthMode, H extends (...args: never[]) => unknown>(
  options: DefineRouteOptions<P, Q, B, A>,
  handler: H
): H {
  const definition: RouteDefinition = {
    auth: options.auth,
    params: options.params as z.ZodType | undefined,
    query: options.query as z.ZodType | undefined,
    body: options.body as z.ZodType | undefined,
    publicCache: (options as { publicCache?: PublicCache }).publicCache,
  }
  Object.defineProperty(handler, ROUTE_DEFINITION, { value: definition, enumerable: false })
  return handler
}

export function defineRoute<
  A extends AuthMode,
  P = undefined,
  Q = undefined,
  B = undefined,
>(options: DefineRouteOptions<P, Q, B, A>) {
  return withDefinition(options, async function handler(
    request: NextRequest,
    args?: RouteArgs
  ): Promise<Response> {
    const requestId = crypto.randomUUID()

    try {
      // --- 出どころ ---------------------------------------------------
      // 別サイトのページから送られた変更を断る（`same-origin.ts`）。
      // cron はブラウザから来ないうえ、合言葉（Bearer）で確かめている
      if (options.auth !== 'cron' && isCrossOriginWrite(request)) {
        throw crossOriginError()
      }

      // --- 認証 -------------------------------------------------------
      let session: Session | null = null

      // cron はセッションを持たない。合言葉だけで通す
      if (options.auth === 'cron') {
        if (!verifyCronToken(request.headers.get('authorization'))) {
          throw ApiError.unauthenticated()
        }
      }

      if (options.auth !== 'none' && options.auth !== 'cron') {
        session = await getSession()
        if (!session && options.auth !== 'optional') {
          throw ApiError.unauthenticated()
        }
      }

      // 管理者判定は**必ずDBで確認する**。トークンの adm はヒントに過ぎず、
      // 権限剥奪が反映されないまま通ってしまう。管理ルートは人間駆動で
      // トラフィックが誤差なので、PK1回の読み取りを惜しまない。
      if (options.auth === 'admin') {
        if (!session || !(await isAdminUser(session.user.id))) {
          throw ApiError.forbidden('管理者権限が必要です')
        }
      }

      // --- 入力の検証 -------------------------------------------------
      const rawParams = args?.params ? await args.params : {}
      const params = parseOr(options.params, rawParams, 'パス')

      const rawQuery = Object.fromEntries(new URL(request.url).searchParams)
      const query = parseOr(options.query, rawQuery, 'クエリ')

      let rawBody: unknown = undefined
      if (options.body) {
        try {
          rawBody = await request.json()
        } catch {
          throw ApiError.validation('リクエストボディが不正なJSONです')
        }
      }
      const body = parseOr(options.body, rawBody, 'リクエストボディ')

      // --- ガード -----------------------------------------------------
      if (options.guard) {
        if (!session) throw ApiError.unauthenticated()
        await options.guard({ params, session })
      }

      // --- 本体 -------------------------------------------------------
      const result = await options.handler({
        request,
        params,
        query,
        body,
        session: session as RouteContext<P, Q, B, A>['session'],
        requestId,
      })

      /*
        ハンドラが自前でレスポンスを返した場合（CSV・ICS・リダイレクト等）は
        そのまま通す。それ以外は data エンベロープに包む。

        **`NextResponse` ではなく `Response` で見ること。** `NextResponse` は
        `Response` の派生なので両方ここを通るが、逆は通らない。素の
        `new Response(csv)` を返していた日程調整のCSV出力が
        `{"data":{}}` という JSON に包まれて配信されていた
        （`Response` オブジェクトを JSON 化すると空になる）。
        ルート側の書き方に依存させると、この事故は静かに再発する。
      */
      /*
        **ハンドラが返した Response にも、下のキャッシュの判断を通す。**
        素通しすると `ok()` / `okList()` を返すルートに `Cache-Control` が
        付かず、`next.config.ts` の網から外した公開キャッシュ対象のパスでは
        **何のヘッダも無い応答**になり、CDN が独自の判断で持ちうる。自分でヘッダを決めている応答
        （CSV・ICS など）は下で尊重する。
      */
      const response = result instanceof Response ? result : NextResponse.json({ data: result })

      /*
        **成功したときだけ付ける。** エラーは下の catch で返すのでここを
        通らない。500 を30分配り続ける、が起きない。
      */
      const cache = (options as BaseOptions<P, Q, B, A> & { publicCache?: PublicCache })
        .publicCache

      // ハンドラが自分で決めているなら、それを尊重する
      if (response.headers.has('Cache-Control')) return response

      if (cache) {
        response.headers.set(
          'Cache-Control',
          `public, s-maxage=${cache.sMaxAge}, stale-while-revalidate=${cache.staleWhileRevalidate}`
        )
        /*
          **Cookie で分けさせない。** 付けてよいのは応答が閲覧者に依らない
          ルートだけなので、Cookie を鍵に混ぜると同じ中身を人数分持つだけになる。
          Cloudflare は Accept-Encoding 以外の Vary を無視する（proxy.ts 参照）。
        */
        response.headers.set('Vary', 'Accept-Encoding')
      } else {
        /*
          **既定は「キャッシュさせない」を明示する。**
          `next.config.ts` が `/api/*` に同じものを被せているが、公開キャッシュを
          許した例外パスはその網から外れる。ルート自身が宣言していないと、
          `auth` を後から変えたときに**何のヘッダも付かないURL**ができる
          （明示的な指示が無ければ CDN は独自の判断で持ちうる）。
        */
        response.headers.set('Cache-Control', 'private, no-store')
      }

      return response
    } catch (error) {
      const apiError = toApiError(error)

      if (apiError.status >= 500) {
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'api.unhandled',
            requestId,
            path: new URL(request.url).pathname,
            method: request.method,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          })
        )
      }

      return errorResponse(apiError, requestId)
    }
  })
}
