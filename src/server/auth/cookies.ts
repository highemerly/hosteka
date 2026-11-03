import 'server-only'

import type { NextResponse } from 'next/server'

import { COOKIE_MAX_AGE_SESSION, COOKIE_SESSION, COOKIE_VIEWER } from '@/lib/cookie-names'

const isProd = process.env.NODE_ENV === 'production'

/** viewer cookie に載せる表示専用の情報。機密は一切含めない */
export type Viewer = {
  id: string
  name: string
  avatar: string | null
  isAdmin: boolean
  username: string
  server: string
  platform: string
  /** 形式のバージョン。読み出し側は不一致なら無視する */
  v: 1
}

/** avatar のURLは長くなりうるので上限を設ける（Cookieは全リクエストに乗る） */
const AVATAR_MAX_LENGTH = 300
/** Cookie 全体のサイズ上限。超えると一部ブラウザが黙って捨てる */
const VIEWER_MAX_BYTES = 1024

export function encodeViewer(viewer: Omit<Viewer, 'v'>): string {
  const payload: Viewer = {
    ...viewer,
    avatar:
      viewer.avatar && viewer.avatar.length <= AVATAR_MAX_LENGTH ? viewer.avatar : null,
    v: 1,
  }
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')

  if (encoded.length > VIEWER_MAX_BYTES) {
    // 表示用の情報が欠けてもログインは成立させる。名前だけに切り詰める。
    const minimal: Viewer = { ...payload, avatar: null, name: payload.name.slice(0, 50) }
    return Buffer.from(JSON.stringify(minimal), 'utf8').toString('base64url')
  }
  return encoded
}

/**
 * セッション Cookie とビューア Cookie を**必ず同時に**設定する。
 * 片方だけ更新すると「ログイン済みなのに古い名前が出る」等の不整合になる。
 */
export function setSessionCookies(
  response: NextResponse,
  token: string,
  viewer: Omit<Viewer, 'v'>
): void {
  const base = {
    path: '/' as const,
    sameSite: 'lax' as const,
    secure: isProd,
    maxAge: COOKIE_MAX_AGE_SESSION,
  }

  response.cookies.set(COOKIE_SESSION, token, { ...base, httpOnly: true })
  // httpOnly ではない。クライアントが同期的に読めることが存在意義。
  response.cookies.set(COOKIE_VIEWER, encodeViewer(viewer), { ...base, httpOnly: false })
}

export function clearSessionCookies(response: NextResponse): void {
  const base = { path: '/' as const, sameSite: 'lax' as const, secure: isProd, maxAge: 0 }
  response.cookies.set(COOKIE_SESSION, '', { ...base, httpOnly: true })
  response.cookies.set(COOKIE_VIEWER, '', { ...base, httpOnly: false })
}
