import 'server-only'

import crypto from 'crypto'

import { getAuthSecret } from '@/server/auth/secret'

/**
 * MiAuth のコールバック URL に載せる値の署名。
 *
 * **MiAuth には state が無い。** コールバック URL はこちらが組み立て、
 * 相手のサーバーはそれへ戻すだけなので、URL の値は誰でも書き換えられる。
 * 信じてよいのは署名した値だけ。
 *
 * **署名に入れない値で、振る舞いを変えない。** たとえば署名の外の `userId` で
 * 「その人としてセッションを出す」をすると、自分の MiAuth で認証して
 * `userId` だけ書き換えれば他人としてログインできる。
 * 取り直しの分岐は持たない — 誰であるかは認証したアカウントで決まる。
 *
 * 投稿の権限を要求したか（`write`）は署名に入れる。MiAuth は付与した権限を
 * 返さないので、これが `hasWritePermission` の唯一の根拠になる。
 */
export type MiAuthCallbackValues = {
  server: string
  session: string
  timestamp: number
  write: boolean
}

function payload(v: MiAuthCallbackValues): string {
  return [v.server, v.session, String(v.timestamp), v.write ? '1' : '0'].join(':')
}

function hmac(data: string): string {
  return crypto.createHmac('sha256', getAuthSecret()).update(data).digest('hex')
}

export function signMiAuthCallback(v: MiAuthCallbackValues): string {
  return hmac(payload(v))
}

export function verifyMiAuthCallback(v: MiAuthCallbackValues, signature: string): boolean {
  const expected = Buffer.from(hmac(payload(v)), 'hex')
  const actual = Buffer.from(signature, 'hex')
  // 長さが違うと timingSafeEqual が投げる
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}
