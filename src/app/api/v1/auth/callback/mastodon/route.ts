export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { hasWriteScope } from '@/lib/write-scope'
import { prisma } from '@/lib/prisma'
import { updateUserLoginInfo, checkBannedUser } from '@/lib/user-tracking'
import { getBaseUrl } from '@/lib/base-url'
import { COOKIE_OAUTH_SESSION, COOKIE_SECURE } from '@/lib/cookie-names'
import { verifyUserWithWebFinger } from '@/lib/webfinger'
import { getSafeRedirectUrl } from '@/lib/redirect-url'
import { recordTermsAcceptance } from '@/server/auth/terms'
import { decrypt, decryptAccessToken, OAuthSessionData, encryptAccessToken } from '@/lib/crypto'
import { issueSessionRedirect } from '@/server/auth/oauth-callback'
import { findOauthApp, findOauthAppsForServer, oauthRedirectUri } from '@/server/auth/oauth-app'
import { revokeOAuthToken } from '@/server/auth/revoke-token'
import { loginIdentity } from '@/server/auth/login-identity'
import { remoteFetch } from '@/server/remote-fetch'
import { sanitizeAvatarUrl, sanitizeDisplayName } from '@/lib/profile-text'

/*
  **返り値の型を明記する。** 書かないと、返し忘れた経路があっても
  `Promise<NextResponse | undefined>` と推論されて typecheck が通る。
  ここで返し損なうとログインが無言で失敗する（実際、同意画面を外す
  作業で Mastodon のセッション発行を丸ごと落としかけた）。
*/
export async function GET(request: NextRequest): Promise<NextResponse> {
  // 実際のリクエストホストから適切なベースURLを取得
  const baseUrl = getBaseUrl()

  // セッションクッキーを削除するためのヘルパー関数。
  // **Secure と Path を渡す。** 本番の名前は `__Host-` 付きで、属性が欠けた
  // Set-Cookie はブラウザが捨てる（消したつもりで残る）
  const clearOAuthSession = (response: NextResponse) => {
    response.cookies.delete({ name: COOKIE_OAUTH_SESSION, path: '/', secure: COOKIE_SECURE })
    return response
  }

  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    if (!code || !state) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=missing_parameters`)
    }

    // stateから情報を取得・検証
    let stateInfo
    try {
      stateInfo = JSON.parse(Buffer.from(state, 'base64url').toString())
    } catch {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=invalid_state`)
    }

    const { csrf, timestamp, callbackUrl } = stateInfo

    /*
      クライアント情報は、register が発行した暗号化 Cookie からだけ読む。

      **state から読まない。** state は署名されておらず、そこから接続情報を
      読むと、攻撃者が自分の OAuth アプリの情報と認可コードを詰めたリンクを
      踏ませるだけで、踏んだ人を攻撃者のアカウントでログインさせられる。
      Cookie はこのブラウザで始めたログインにしか無い。
    */
    const encryptedSession = request.cookies.get(COOKIE_OAUTH_SESSION)?.value
    const sessionData = encryptedSession ? decrypt<OAuthSessionData>(encryptedSession) : null

    if (!sessionData || sessionData.platform !== 'mastodon') {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=missing_session`)
    }

    const { server, appId } = sessionData
    if (!server || !appId) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=missing_session`)
    }

    /*
      CSRF保護とタイムスタンプ検証。**state の値で飛ばさない。** state は
      利用者が書き換えられる。
    */
    if (!csrf || !timestamp) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=invalid_state`)
    }

    // 10分以内かチェック（クッキーの有効期限と合わせる）
    if (Date.now() - timestamp > 10 * 60 * 1000) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=expired_state`)
    }

    // state の csrf を、このブラウザの Cookie に入れた値と突き合わせる。
    // 別のログインで出た認可コードと state を持ち込まれても通さない
    if (csrf !== sessionData.csrf) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=invalid_state`)
    }

    // register が使ったアプリ。シークレットは Cookie ではなく DB にある
    const app = await findOauthApp({ id: appId, platform: 'mastodon', server })
    if (!app) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=missing_session`)
    }

    // アクセストークン取得
    const tokenResponse = await remoteFetch(`https://${server}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Hosteka/1.0'
      },
      body: JSON.stringify({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: oauthRedirectUri(baseUrl, 'mastodon'),
        /*
          **要求した scope を明示する。** 省略したときに何が返るかは
          サーバーの実装次第で、Mastodon の文書は「省略すると read」と
          書いている。黙って読み取り専用のトークンを受け取ると、
          投稿の権限を付けたつもりで付いておらず、送って初めて分かる。
          認可のときと同じ文字列なので、必ず部分集合になる。
        */
        ...(sessionData.scopes ? { scope: sessionData.scopes } : {}),
      }),
    })

    if (!tokenResponse.ok) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=token_exchange_failed`)
    }

    const tokenData = await tokenResponse.json()

    /*
      要求したのに投稿の権限が付いてこなかった場合は記録する。
      **画面には出せない**（利用者にできることが無い）が、
      「入り直しても直らない」と言われたときに、こちら側の問題か
      相手のサーバーの挙動かをここで切り分けられる。
    */
    if (sessionData.scopes?.includes('write') && hasWriteScope(tokenData.scope) === false) {
      console.warn(
        `[OAuth] 投稿の権限を要求したが付与されなかった: server=${server} scope=${tokenData.scope}`
      )
    }

    // ユーザー情報取得
    const userResponse = await remoteFetch(`https://${server}/api/v1/accounts/verify_credentials`, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'User-Agent': 'Hosteka/1.0'
      },
    })

    if (!userResponse.ok) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=user_fetch_failed`)
    }

    const userData = await userResponse.json()

    /*
      **保存する前に形を確かめる。** username は相手のサーバーの応答そのままで、
      `@` を含む username を保存すると、`username@server` を後ろから切り直す
      判定（参加できるサーバーの制限など）を騙せる。読む側（`parseUserHandle`）と
      同じ形を要求する。
    */
    const identity = loginIdentity(userData.username, server)
    if (!identity) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=invalid_account`)
    }
    const normalizedUsername = identity.username
    const normalizedServer = identity.server

    // WebFinger検証（監査ログ用・非ブロッキング）
    // 主要な安全性はAuthorization Code Flowで担保されているため、ログ記録のみ
    verifyUserWithWebFinger(normalizedUsername, normalizedServer, 'mastodon')
      .then(result => {
        if (!result.valid) {
          console.warn(`[WebFinger Audit] Verification failed for ${normalizedUsername}@${normalizedServer}:`, result.error, result.details)
        }
      })
      .catch(err => {
        console.warn(`[WebFinger Audit] Error checking ${normalizedUsername}@${normalizedServer}:`, err)
      })

    // BANチェック
    const isBanned = await checkBannedUser(normalizedUsername, normalizedServer)
    if (isBanned) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=user_banned`)
    }

    /*
      投稿の権限を持つトークンか。**保存しないと事前に案内できない** —
      読み取りだけのトークンでも「直接投稿できる」ように見え、
      本文を書き終えてから断られることになる。
      scope が返ってこないサーバーでは null（＝分からない）のまま。
    */
    const writePermission = hasWriteScope(tokenData.scope)
    // 入り直す前のトークン。新しいトークンを保存できてから失効させる
    const previous = await prisma.user.findUnique({
      where: { username_server: { username: normalizedUsername, server: normalizedServer } },
      select: { accessToken: true, platform: true },
    })

    // ユーザーをDBに保存または更新
    const user = await prisma.user.upsert({
      where: {
        username_server: {
          username: normalizedUsername,
          server: normalizedServer,
        },
      },
      update: {
        displayName: sanitizeDisplayName(userData.display_name, normalizedUsername),
        avatar: sanitizeAvatarUrl(userData.avatar),
        accessToken: encryptAccessToken(tokenData.access_token),
        hasWritePermission: writePermission,
        updatedAt: new Date(),
      },
      create: {
        username: normalizedUsername,
        displayName: sanitizeDisplayName(userData.display_name, normalizedUsername),
        avatar: sanitizeAvatarUrl(userData.avatar),
        server: normalizedServer,
        platform: 'mastodon',
        accessToken: encryptAccessToken(tokenData.access_token),
        hasWritePermission: writePermission,
      },
    })

    /*
      前のトークンは、もう Hosteka が使わない。相手のサーバーに有効なまま
      残さないよう失効させる。前のトークンは別の権限の組のアプリで
      発行されたかもしれないので、今回のアプリから順に試す
      （`server/auth/revoke-token.ts`）
    */
    const previousToken =
      previous?.platform === 'mastodon' ? decryptAccessToken(previous.accessToken) : null
    if (previousToken && previousToken !== tokenData.access_token) {
      const others = await findOauthAppsForServer({ platform: 'mastodon', server, baseUrl })
      await revokeOAuthToken(server, [app, ...others.filter((o) => o.id !== app.id)], previousToken)
    }

    /*
      **権限の取り直しを別扱いしない。** state は署名されていないので、
      そこにある値で「誰として扱うか」を変えてはいけない。
      取り直しも、認証したアカウントで upsert するこの経路で足りる。
    */

    /*
      同意はログイン画面で取っている（`register` が `termsAccepted` を
      必須にしている）。**初めての人はここで記録してからセッションを出す。**
      以前は `/auth/consent` へ寄り道させていたが、ログイン画面にも同意の
      トグルが要るようになり、同じ同意を2回取ることになっていた。
    */
    if (!user.lastTermsAcceptedAt) {
      await recordTermsAcceptance(user.id)
    }

    await updateUserLoginInfo(user.id, request)

    const finalUrl = getSafeRedirectUrl(callbackUrl, baseUrl, '/dashboard')
    const response = await issueSessionRedirect(user, finalUrl)
    return clearOAuthSession(response)
  } catch (error) {
    console.error('Error in Mastodon callback:', error)
    const errorResponse = NextResponse.redirect(`${baseUrl}/auth/error?error=internal_error`)
    return clearOAuthSession(errorResponse)
  }
}