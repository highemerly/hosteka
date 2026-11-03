export const dynamic = 'force-dynamic'

import { defineRoute } from '@/server/http/define-route'
import { registerPleromaBody } from '@/schemas/auth'
import { ApiError } from '@/server/http/errors'
import { isBlockedDestination, remoteFetch } from '@/server/remote-fetch'
import { ok } from '@/server/http/response'
import { requireTermsAccepted } from '@/server/auth/terms'
import { oauthScope } from '@/lib/oauth-scopes'
import { getOrRegisterOauthApp, oauthRedirectUri } from '@/server/auth/oauth-app'
import crypto from 'crypto'
import { getBaseUrl } from '@/lib/base-url'
import { encrypt, OAuthSessionData } from '@/lib/crypto'
import { COOKIE_OAUTH_SESSION, COOKIE_MAX_AGE_OAUTH_SESSION } from '@/lib/cookie-names'

export const POST = defineRoute({
  auth: 'none',
  body: registerPleromaBody,
  handler: async ({ body }) => {

    // 同意はここだけで確かめる。コールバックは戻ってきた時点で通っている前提
    requireTermsAccepted(body)
    const { server, callbackUrl } = body

    if (!server) {
      throw ApiError.validation('Server is required')
    }

    // 実際のリクエストホストから適切なベースURLを取得
    const baseUrl = getBaseUrl()

    /*
      **相手のサーバーを確かめる。** この口は未認証で叩けて、本文のホスト名へ
      こちらから接続する。内部への接続とリダイレクトは `remoteFetch` が断る
    */
    try {
      const instanceResponse = await remoteFetch(`https://${server}/api/v1/instance`, {
        headers: { 'User-Agent': 'Hosteka/1.0' },
      })
      if (!instanceResponse.ok) {
        throw ApiError.validation('Invalid Pleroma server')
      }
    } catch (error) {
      if (isBlockedDestination(error)) {
        throw ApiError.validation('このサーバーには接続できません')
      }
      throw ApiError.validation('Could not connect to server')
    }

    // 中身はログイン画面で見せた説明と同じ表から取る（`lib/oauth-scopes.ts`）
    const scopes = oauthScope('pleroma', false)

    // アプリは使い回す（`server/auth/oauth-app.ts`）。Pleroma は投稿を頼まないので読み取りだけで登録する
    const app = await getOrRegisterOauthApp({ platform: 'pleroma', server, baseUrl, scopes })

    const csrfToken = crypto.randomUUID()

    // どのアプリで始めたかを暗号化して Cookie に置く（シークレットは入れない）
    const sessionData: OAuthSessionData = {
      appId: app.id,
      server,
      scopes,
      csrf: csrfToken,
      platform: 'pleroma',
      createdAt: Date.now(),
    }
    const encryptedSession = encrypt(sessionData)

    // OAuth認証URLを生成
    const authUrl = new URL(`https://${server}/oauth/authorize`)
    authUrl.searchParams.set('client_id', app.clientId)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('redirect_uri', oauthRedirectUri(baseUrl, 'pleroma'))
    authUrl.searchParams.set('scope', scopes)

    // stateにはCSRFトークン、タイムスタンプ、callbackUrlのみ（シークレットは含めない）
    const state = Buffer.from(JSON.stringify({
      csrf: csrfToken,
      timestamp: Date.now(),
      callbackUrl: callbackUrl || '/',
    })).toString('base64url')
    authUrl.searchParams.set('state', state)

    // レスポンスを作成し、暗号化されたセッションをクッキーに設定
    const response = ok({
      authUrl: authUrl.toString(),
      server,
    })

    response.cookies.set(COOKIE_OAUTH_SESSION, encryptedSession, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_OAUTH_SESSION,
      path: '/',
    })

    return response
  },
})