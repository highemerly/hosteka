import 'server-only'

import { SignJWT, jwtVerify } from 'jose'

import { getAuthSecret } from './secret'

/** トークン形式のバージョン。上げると既存トークンが一括で無効になる（緊急時用） */
export const TOKEN_VERSION = 1

/** セッションの有効期間（14日）。NextAuth 時代の maxAge を踏襲する */
export const SESSION_MAX_AGE_SEC = 14 * 24 * 60 * 60

/**
 * セッショントークンのクレーム。意図的に最小限にしてある。
 *
 * - 表示用の値（displayName / avatar / email 相当）は入れない。
 *   それは非httpOnly の viewer cookie の仕事であり、両方に持つと不整合の元になる。
 * - platform / server / username も入れない。これらは「誰がイベントに参加できるか」を
 *   決める認可の入力であり、再ログイン時にしか更新されないトークンに載せると
 *   無言で陳腐化する。必要な箇所でDBから読む。
 * - `adm` は UI の出し分けを速くするためのヒントに留める。
 *   権限判定は必ずDBで確認すること（withAdmin）。
 */
export type SessionClaims = {
  /** userId */
  sub: string
  /** sessionId（sessions テーブルの主キー） */
  sid: string
  /** isAdmin のヒント。セキュリティ判断には使わない */
  adm: boolean
  /** トークン形式のバージョン */
  v: number
  iat: number
  exp: number
}

const ISSUER = 'hosteka'
const ALG = 'HS256'

function key(): Uint8Array {
  return new TextEncoder().encode(getAuthSecret())
}

export async function signSession(input: {
  userId: string
  sessionId: string
  isAdmin: boolean
  /** 有効期間（秒）。既定は 14 日 */
  maxAgeSec?: number
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + (input.maxAgeSec ?? SESSION_MAX_AGE_SEC)

  return new SignJWT({ sid: input.sessionId, adm: input.isAdmin, v: TOKEN_VERSION })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setSubject(input.userId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key())
}

/**
 * 署名・発行者・有効期限・トークン版数を検証する。
 * **失効の判定はここでは行わない**（DBに触れずに済ませるため）。
 * 呼び出し側が revocation-cache で `sid` を確認すること。
 */
export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(), {
      issuer: ISSUER,
      algorithms: [ALG],
    })

    if (payload.v !== TOKEN_VERSION) return null
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null
    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return null

    return {
      sub: payload.sub,
      sid: payload.sid,
      adm: payload.adm === true,
      v: payload.v,
      iat: payload.iat,
      exp: payload.exp,
    }
  } catch {
    // 署名不正・期限切れ・形式不正はすべて「セッション無し」に倒す
    return null
  }
}
