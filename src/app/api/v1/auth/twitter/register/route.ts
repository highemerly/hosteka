export const dynamic = 'force-dynamic'

import { defineRoute } from '@/server/http/define-route'
import { registerHostedBody } from '@/schemas/auth'
import { ApiError } from '@/server/http/errors'
import { ok } from '@/server/http/response'
import { requireTermsAccepted } from '@/server/auth/terms'
import { oauthScope } from '@/lib/oauth-scopes'
import crypto from 'crypto'
import { encrypt, type HostedOAuthSessionData } from '@/lib/crypto'
import {
  COOKIE_MAX_AGE_OAUTH_SESSION,
  COOKIE_OAUTH_SESSION,
  COOKIE_SECURE,
} from '@/lib/cookie-names'

// PKCE code_verifier生成（43〜128文字のランダム文字列）
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

// PKCE code_challenge生成（code_verifierのSHA-256ハッシュ）
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

export const POST = defineRoute({
  auth: 'none',
  body: registerHostedBody,
  handler: async ({ body }) => {

    // 同意はここだけで確かめる。コールバックは戻ってきた時点で通っている前提
    requireTermsAccepted(body)
    const { callbackUrl } = body

    if (!process.env.TWITTER_CLIENT_ID) {
      throw ApiError.internal('Twitter OAuth not configured')
    }

    // PKCE用のcode_verifierを生成
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)

    /*
      CSRF 対策の値。**state と Cookie の両方に置いて、突き合わせる。**
      state だけでは「このブラウザで始めたログインか」を確かめられない。
    */
    const csrf = crypto.randomUUID()

    const state = Buffer.from(JSON.stringify({
      callbackUrl: callbackUrl || '/',
      csrf,
      timestamp: Date.now(),
    })).toString('base64url')

    // X OAuth 2.0 Authorization URLを生成
    const authUrl = new URL('https://x.com/i/oauth2/authorize')
    authUrl.searchParams.set('client_id', process.env.TWITTER_CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', `${process.env.NEXTAUTH_URL}/api/v1/auth/callback/twitter`)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', oauthScope('twitter', false))
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')

    /*
      **`code_verifier` は Cookie に置く。state に載せない。**
      載せると challenge と verifier の両方を攻撃者が決められることになり、
      PKCE が「このブラウザで始めたログインか」を何も縛らなくなる。
    */
    const sessionData: HostedOAuthSessionData = {
      platform: 'twitter',
      csrf,
      codeVerifier,
      createdAt: Date.now(),
    }

    const response = ok({
      authUrl: authUrl.toString(),
    })

    response.cookies.set(COOKIE_OAUTH_SESSION, encrypt(sessionData), {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_OAUTH_SESSION,
      path: '/',
    })

    return response
  },
})
