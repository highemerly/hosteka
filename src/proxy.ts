import { NextRequest, NextResponse } from 'next/server'

import { COOKIE_SESSION } from '@/lib/cookie-names'

const CACHE_SETTINGS: Record<string, { maxAge: number; staleWhileRevalidate: number }> = {
  '/': { maxAge: 1800, staleWhileRevalidate: 300 },
  '/faq': { maxAge: 86400, staleWhileRevalidate: 300 },
  '/terms': { maxAge: 86400, staleWhileRevalidate: 300 },
  '/privacy': { maxAge: 86400, staleWhileRevalidate: 300 },
  '/feature': { maxAge: 86400, staleWhileRevalidate: 300 },
  '/release-notes': { maxAge: 86400, staleWhileRevalidate: 300 },
}

/*
  `/admin` は未ログインなら何も出せない（全部が管理者専用の API で描かれる）。
  ここで先にログインへ回す。管理者かどうかは見られない（Cookie の有無だけ）ので、
  ログイン済みの一般ユーザーは画面が「管理者だけ」と案内する。
*/
const PROTECTED_PATHS = ['/dashboard', '/events/create', '/pre-events/create', '/admin']

// 403ページを独自に表示するため、proxy でリダイレクトしないパス
const EXCLUDED_FROM_REDIRECT = ['/dashboard/my-events', '/dashboard/my-pre-events']

// 認可ではなく UX のための判定。Cookie の存在しか見ない（JWT検証はしない）。
// 実際の認可は各ルートが getSession() で行う。
function getSessionCookieName(): string {
  return COOKIE_SESSION
}

/**
 * Next.js のクライアント遷移・プリフェッチによるリクエストかどうか。
 *
 * これらは同じURLに対して HTML ではなく RSC フライトペイロードを返す。
 * Next.js は `Vary: rsc, next-router-state-tree, ...` を付けて区別させようとするが、
 * **Cloudflare は Accept-Encoding 以外の Vary を無視する**ため、HTML と
 * フライトペイロードが同一のキャッシュキーに同居してしまう。
 *
 * その結果、ログイン中ユーザーのクライアント遷移が生成したペイロード
 * （閲覧者ごとの情報を含みうる）が公開キャッシュに載り、匿名ユーザーへ
 * 配信される。
 *
 * 判定に `RSC` / `Next-Router-*` ヘッダは使えない。**Next.js がミドルウェア到達前に
 * それらを除去する**ため、ここからは見えない（本番ビルドで実測して確認済み。
 * ミドルウェアに届くのは accept / host / user-agent / x-forwarded-* のみ）。
 * フライトリクエストは `Accept: text/x-component` を送るので、これで判別する。
 *
 * `Accept` を付けずに `RSC: 1` だけを送られると、ここでは見分けられない。
 * それは `next.config.ts` の `RSC_MARKERS` が CDN に持たせないようにしている。
 */
function isFlightRequest(request: NextRequest): boolean {
  return request.headers.get('accept')?.includes('text/x-component') ?? false
}

function addCacheHeaders(request: NextRequest, response: NextResponse): NextResponse {
  const pathname = request.nextUrl.pathname
  const cacheConfig = CACHE_SETTINGS[pathname]

  if (cacheConfig && !isFlightRequest(request)) {
    response.headers.set(
      'Cache-Control',
      `public, s-maxage=${cacheConfig.maxAge}, stale-while-revalidate=${cacheConfig.staleWhileRevalidate}`
    )
    response.headers.set('Vary', 'Accept-Encoding')
  } else {
    response.headers.set('Cache-Control', 'private, no-cache, no-store')
    response.headers.set('Vary', 'Cookie')
  }

  return response
}

function isProtectedPath(pathname: string): boolean {
  // 除外パスはリダイレクトしない（クライアント側で403表示）
  if (EXCLUDED_FROM_REDIRECT.some(path => pathname.startsWith(path))) return false

  if (PROTECTED_PATHS.some(path => pathname.startsWith(path))) return true
  if (/^\/events\/[^\/]+\/edit$/.test(pathname)) return true
  if (/^\/pre-events\/[^\/]+\/edit$/.test(pathname)) return true
  // 日程調整をイベントにする。作成者とグループの管理者だけが開ける
  if (/^\/pre-events\/[^\/]+\/promote$/.test(pathname)) return true
  // 連絡は回答者と主催者だけが開ける。未ログインで開いても何も出せない
  if (/^\/pre-events\/[^\/]+\/contact$/.test(pathname)) return true
  return false
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl

  // 認証チェック（Cookieの存在のみ確認）
  if (isProtectedPath(pathname)) {
    const sessionCookie = request.cookies.get(getSessionCookieName())
    if (!sessionCookie?.value) {
      const signInUrl = new URL('/auth/signin', request.url)
      signInUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(signInUrl)
    }
  }

  const response = NextResponse.next()
  return addCacheHeaders(request, response)
}

export const config = {
  matcher: [
    '/', '/faq', '/terms', '/privacy', '/feature', '/release-notes',
    '/dashboard/:path*', '/events/:path*', '/pre-events/:path*',
    '/admin', '/admin/:path*',
  ]
}
