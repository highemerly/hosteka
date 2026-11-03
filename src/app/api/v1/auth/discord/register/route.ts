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

export const POST = defineRoute({
  auth: 'none',
  body: registerHostedBody,
  handler: async ({ body }) => {

    // 同意はここだけで確かめる。コールバックは戻ってきた時点で通っている前提
    requireTermsAccepted(body)
    const { callbackUrl } = body

    if (!process.env.DISCORD_CLIENT_ID) {
      throw ApiError.internal('Discord OAuth not configured')
    }

    /*
      CSRF 対策の値。**state と Cookie の両方に置いて、突き合わせる。**
      state だけでは「このブラウザで始めたログインか」を確かめられない
      （署名も保存もされていない只の base64 で、誰でも自作できる）。
    */
    const csrf = crypto.randomUUID()

    const state = Buffer.from(JSON.stringify({
      callbackUrl: callbackUrl || '/',
      csrf,
      timestamp: Date.now(),
    })).toString('base64url')

    // Discord OAuth2 URLを生成
    const authUrl = new URL('https://discord.com/api/oauth2/authorize')
    authUrl.searchParams.set('client_id', process.env.DISCORD_CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', `${process.env.NEXTAUTH_URL}/api/v1/auth/callback/discord`)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', oauthScope('discord', false))
    authUrl.searchParams.set('state', state)

    const sessionData: HostedOAuthSessionData = {
      platform: 'discord',
      csrf,
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
