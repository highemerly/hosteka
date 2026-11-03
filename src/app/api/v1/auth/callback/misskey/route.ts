export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { hasMisskeyWritePermission } from '@/lib/write-scope'
import { prisma } from '@/lib/prisma'
import { updateUserLoginInfo, checkBannedUser } from '@/lib/user-tracking'
import { getBaseUrl } from '@/lib/base-url'
import { verifyMisskeyUser } from '@/lib/webfinger'
import { getSafeRedirectUrl } from '@/lib/redirect-url'
import { recordTermsAcceptance } from '@/server/auth/terms'
import { COOKIE_OAUTH_SESSION, COOKIE_SECURE } from '@/lib/cookie-names'
import { decrypt, decryptAccessToken, encryptAccessToken, type MiAuthSessionData } from '@/lib/crypto'
import { revokeMisskeyToken } from '@/server/auth/revoke-token'
import { verifyMiAuthCallback } from '@/server/auth/miauth-callback'
import { issueSessionRedirect } from '@/server/auth/oauth-callback'
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

  // **Secure と Path を渡す。** 本番の名前は `__Host-` 付きで、属性が欠けた
  // Set-Cookie はブラウザが捨てる（消したつもりで残る）
  const clearOAuthSession = (response: NextResponse) => {
    response.cookies.delete({ name: COOKIE_OAUTH_SESSION, path: '/', secure: COOKIE_SECURE })
    return response
  }

  try {
    const url = new URL(request.url)
    const session = url.searchParams.get('session')
    const server = url.searchParams.get('server')
    const callbackUrl = url.searchParams.get('callbackUrl') || '/dashboard'
    const write = url.searchParams.get('write') === '1'

    // 署名とタイムスタンプを取得
    const timestamp = url.searchParams.get('ts')
    const signature = url.searchParams.get('sig')

    if (!session || !server || !timestamp || !signature) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=missing_parameters`)
    }

    // 署名を検証（server, session, timestamp, write の改ざん防止）。
    // **ここで確かめた値以外で振る舞いを変えない**（`server/auth/miauth-callback.ts`）
    const signed = verifyMiAuthCallback(
      { server, session, timestamp: Number(timestamp), write },
      signature
    )

    if (!signed) {
      console.error('Misskey callback signature mismatch')
      return NextResponse.redirect(`${baseUrl}/auth/error?error=invalid_state`)
    }

    // タイムスタンプ検証（5分以内）
    const ts = parseInt(timestamp, 10)
    if (isNaN(ts) || Date.now() - ts > 5 * 60 * 1000) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=expired_state`)
    }

    /*
      **このブラウザで始めたログインか。** 署名は URL の書き換えを防ぐが、
      URL ごと踏ませることは防げない。自分のアカウントで承認したコールバック
      URL を他人に踏ませると、その人を自分のアカウントでログインさせられる。
    */
    const encryptedSession = request.cookies.get(COOKIE_OAUTH_SESSION)?.value
    const sessionData = encryptedSession ? decrypt<MiAuthSessionData>(encryptedSession) : null
    if (!sessionData || sessionData.platform !== 'misskey') {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=missing_session`)
    }
    if (sessionData.session !== session || sessionData.server !== server) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=invalid_state`)
    }

    // MiAuthセッションの確認
    const authCheckResponse = await remoteFetch(`https://${server}/api/miauth/${session}/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Hosteka/1.0'
      },
      body: JSON.stringify({})
    })

    if (!authCheckResponse.ok) {
      console.error('Misskey auth check failed:', authCheckResponse.status, await authCheckResponse.text())
      return NextResponse.redirect(`${baseUrl}/auth/error?error=verification_failed`)
    }

    const authData = await authCheckResponse.json()

    if (!authData.token) {
      console.error('Misskey auth not completed or no token received')
      return NextResponse.redirect(`${baseUrl}/auth/error?error=verification_failed`)
    }

    // ユーザー情報を取得
    const userResponse = await remoteFetch(`https://${server}/api/i`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Hosteka/1.0'
      },
      body: JSON.stringify({
        i: authData.token
      }),
    })

    if (!userResponse.ok) {
      console.error('Failed to fetch user info from Misskey')
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
    // 主要な安全性はMiAuthのsessionId検証で担保されているため、ログ記録のみ
    verifyMisskeyUser(normalizedUsername, normalizedServer, authData.token)
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
      投稿の権限を持つトークンか。**MiAuth は権限を返さない**ので、
      こちらが要求した権限で決める（承認されなければトークン自体が来ない）。
      要求したかどうかは署名済みの `write` で見る。

      **権限の取り直しを別扱いしない。** URL の値は署名の外にあり、
      それで「誰として扱うか」を変えると、自分の MiAuth で認証して
      書き換えるだけで他人としてログインできる。取り直しも、認証した
      アカウントで引いて更新するふつうのログインで足りる。
    */
    const writePermission = hasMisskeyWritePermission(write)

    // 入り直す前のトークン。新しいトークンを保存できてから失効させる
    const previous = await prisma.user.findUnique({
      where: { username_server: { username: normalizedUsername, server: normalizedServer } },
      select: { accessToken: true, platform: true },
    })

    // 通常の新規登録/ログイン処理
    const user = await prisma.user.upsert({
      where: {
        username_server: {
          username: normalizedUsername,
          server: normalizedServer,
        },
      },
      update: {
        displayName: sanitizeDisplayName(userData.name, normalizedUsername),
        avatar: sanitizeAvatarUrl(userData.avatarUrl),
        platform: 'misskey',
        accessToken: encryptAccessToken(authData.token),
        hasWritePermission: writePermission,
        updatedAt: new Date(),
      },
      create: {
        username: normalizedUsername,
        displayName: sanitizeDisplayName(userData.name, normalizedUsername),
        server: normalizedServer,
        platform: 'misskey',
        avatar: sanitizeAvatarUrl(userData.avatarUrl),
        accessToken: encryptAccessToken(authData.token),
        hasWritePermission: writePermission,
      },
    })

    /*
      同意はログイン画面で取っている（`register` が `termsAccepted` を
      必須にしている）。**初めての人はここで記録してからセッションを出す。**
      以前は `/auth/consent` へ寄り道させていたが、ログイン画面にも同意の
      トグルが要るようになり、同じ同意を2回取ることになっていた。
    */
    if (!user.lastTermsAcceptedAt) {
      await recordTermsAcceptance(user.id)
    }

    /*
      **MiAuth は承認のたびに新しいトークンを作る**（Mastodon のようにアプリを
      使い回せない）。放っておくと、利用者の「連携アプリ」に Hosteka が
      ログインの回数だけ並ぶ。もう使わない前のトークンは、ここで失効させる。
    */
    const previousToken =
      previous?.platform === 'misskey' ? decryptAccessToken(previous.accessToken) : null
    if (previousToken && previousToken !== authData.token) {
      await revokeMisskeyToken(server, previousToken)
    }

    // ログイン情報の更新（IP・最終ログイン日時）
    await updateUserLoginInfo(user.id, request)

    // 安全なリダイレクトURLを取得
    const redirectUrl = getSafeRedirectUrl(callbackUrl, baseUrl, '/dashboard')

    const response = await issueSessionRedirect(user, redirectUrl)
    return clearOAuthSession(response)
  } catch (error) {
    console.error('Error in Misskey callback:', error)
    return clearOAuthSession(NextResponse.redirect(`${baseUrl}/auth/error?error=internal_error`))
  }
}