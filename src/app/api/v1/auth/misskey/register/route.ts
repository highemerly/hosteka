export const dynamic = 'force-dynamic'

import { defineRoute } from '@/server/http/define-route'
import { registerWithServerBody } from '@/schemas/auth'
import { ApiError } from '@/server/http/errors'
import { isBlockedDestination, remoteFetch } from '@/server/remote-fetch'
import { ok } from '@/server/http/response'
import { requireTermsAccepted } from '@/server/auth/terms'
import { oauthScope } from '@/lib/oauth-scopes'
import { signMiAuthCallback } from '@/server/auth/miauth-callback'
import { getBaseUrl } from '@/lib/base-url'
import { encrypt, type MiAuthSessionData } from '@/lib/crypto'
import { COOKIE_MAX_AGE_OAUTH_SESSION, COOKIE_OAUTH_SESSION, COOKIE_SECURE } from '@/lib/cookie-names'
import crypto from 'crypto'

export const POST = defineRoute({
  auth: 'none',
  body: registerWithServerBody,
  handler: async ({ body }) => {

    // 同意はここだけで確かめる。コールバックは戻ってきた時点で通っている前提
    requireTermsAccepted(body)
    const { server, callbackUrl, requestWritePermission } = body

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
      const instanceResponse = await remoteFetch(`https://${server}/api/meta`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Hosteka/1.0'
        },
        body: JSON.stringify({}),
      })
      if (!instanceResponse.ok) {
        throw ApiError.validation('Invalid Misskey server')
      }
    } catch (error) {
      if (isBlockedDestination(error)) {
        throw ApiError.validation('このサーバーには接続できません')
      }
      throw ApiError.validation('Could not connect to server')
    }

    // MiAuthセッションIDを生成
    const sessionId = crypto.randomUUID()

    // 投稿の権限を要求するか。**ログイン中の誰かに紐づけない** —
    // 誰の権限になるかは、コールバックで認証したアカウントが決める
    const write = requestWritePermission === true

    // タイムスタンプ（リプレイ攻撃防止）
    const timestamp = Date.now()

    // 署名を生成（server, sessionId, timestamp, write の改ざん防止）。
    // コールバックは署名した値だけを信じる（`server/auth/miauth-callback.ts`）
    const signature = signMiAuthCallback({ server, session: sessionId, timestamp, write })

    // コールバックURLにパラメータを追加
    const callbackParams = new URLSearchParams({
      server,
      callbackUrl: callbackUrl || '/',
      session: sessionId,
      ts: String(timestamp),
      write: write ? '1' : '0',
      sig: signature,
    })

    // OAuth認証URLを生成 (MiAuth方式)
    const authUrl = new URL(`https://${server}/miauth/${sessionId}`)
    authUrl.searchParams.set('name', 'Hosteka')
    authUrl.searchParams.set('callback', `${baseUrl}/api/v1/auth/callback/misskey?${callbackParams}`)

    // 権限設定: 書き込み権限が必要な場合は write:notes を追加。
    // 中身はログイン画面で見せた説明と同じ表から取る（`lib/oauth-scopes.ts`）
    const permissions = oauthScope('misskey', write)
    authUrl.searchParams.set('permission', permissions)

    const response = ok({
      authUrl: authUrl.toString(),
      server,
    })

    // このブラウザで始めたログインだと、コールバックで確かめるため
    const sessionData: MiAuthSessionData = {
      platform: 'misskey',
      server,
      session: sessionId,
      createdAt: timestamp,
    }
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