export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { updateUserLoginInfo, checkBannedUser } from '@/lib/user-tracking'
import { getBaseUrl } from '@/lib/base-url'
import { getSafeRedirectUrl } from '@/lib/redirect-url'
import { recordTermsAcceptance } from '@/server/auth/terms'
import { issueSessionRedirect } from '@/server/auth/oauth-callback'
import { loginIdentity } from '@/server/auth/login-identity'
import { isPlatformUserId, resolveHostedUser } from '@/server/auth/hosted-user'
import { COOKIE_OAUTH_SESSION, COOKIE_SECURE } from '@/lib/cookie-names'
import { decrypt, type HostedOAuthSessionData } from '@/lib/crypto'
import { sanitizeDisplayName } from '@/lib/profile-text'

/*
  **返り値の型を明記する。** 書かないと、返し忘れた経路があっても
  `Promise<NextResponse | undefined>` と推論されて typecheck が通る。
  ここで返し損なうとログインが無言で失敗する（実際、同意画面を外す
  作業で Mastodon のセッション発行を丸ごと落としかけた）。
*/
export async function GET(request: NextRequest): Promise<NextResponse> {
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

    // stateから情報を取得
    let stateInfo
    try {
      stateInfo = JSON.parse(Buffer.from(state, 'base64url').toString())
    } catch {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=invalid_state`)
    }

    // CSRF保護とタイムスタンプ検証
    if (!stateInfo.csrf || !stateInfo.timestamp) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=invalid_state`)
    }

    // 10分以内かチェック（クッキーの有効期限と合わせる）
    if (Date.now() - stateInfo.timestamp > 10 * 60 * 1000) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=expired_state`)
    }

    /*
      **state の csrf を、このブラウザの Cookie に入れた値と突き合わせる。**

      state は署名も保存もされていない只の base64 で、誰でも自作できる。
      これが無いと、攻撃者が自分の認可コードと自作の state を並べたリンクを
      踏ませるだけで、踏んだ人を攻撃者のアカウントでログインさせられる
      （同意の記録まで押される）。Cookie はこのブラウザで始めたログインにしか無い。
    */
    const encryptedSession = request.cookies.get(COOKIE_OAUTH_SESSION)?.value
    const sessionData = encryptedSession
      ? decrypt<HostedOAuthSessionData>(encryptedSession)
      : null

    if (!sessionData || sessionData.platform !== 'discord') {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=missing_session`)
    }

    if (stateInfo.csrf !== sessionData.csrf) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=invalid_state`)
    }

    // アクセストークンを取得
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Hosteka/1.0'
      },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${baseUrl}/api/v1/auth/callback/discord`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Discord token exchange failed:', errorText)
      return NextResponse.redirect(`${baseUrl}/auth/error?error=token_exchange_failed`)
    }

    const tokenData = await tokenResponse.json()

    // ユーザー情報を取得
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'User-Agent': 'Hosteka/1.0'
      },
    })

    if (!userResponse.ok) {
      console.error('Failed to fetch user info from Discord')
      return NextResponse.redirect(`${baseUrl}/auth/error?error=user_fetch_failed`)
    }

    const userData = await userResponse.json()

    /*
      **保存する前に形を確かめる。** username は相手のサーバーの応答そのままで、
      `@` を含む username を保存すると、`username@server` を後ろから切り直す
      判定（参加できるサーバーの制限など）を騙せる。読む側（`parseUserHandle`）と
      同じ形を要求する。
    */
    const identity = loginIdentity(userData.username, 'discord.com')
    if (!identity) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=invalid_account`)
    }
    const normalizedUsername = identity.username

    /*
      **アカウントはIDで見分ける。** ユーザー名は変えられ、手放した名前を
      他人が取れる（`server/auth/hosted-user.ts`）。IDが取れなければ
      照合のしようが無いので、ログインを断る。
    */
    if (!isPlatformUserId(userData.id)) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=invalid_account`)
    }

    // BANチェック
    const isBanned = await checkBannedUser(normalizedUsername, 'discord.com')
    if (isBanned) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=user_banned`)
    }

    // アバターURLを構築
    const avatarUrl = userData.avatar
      ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
      : null

    const user = await resolveHostedUser({
      platform: 'discord',
      server: 'discord.com',
      platformUserId: userData.id,
      username: normalizedUsername,
      displayName: sanitizeDisplayName(userData.global_name, normalizedUsername),
      avatar: avatarUrl,
    })

    /*
      **名前を変えて入り直した人の停止も止める。** 上の BAN チェックは
      名前で引くので、停止されたあとでハンドルを変えると素通りする。
    */
    if (user.ban) {
      return NextResponse.redirect(`${baseUrl}/auth/error?error=user_banned`)
    }

    /*
      同意はログイン画面で取っている（`register` が `termsAccepted` を
      必須にしている）。**初めての人はここで記録してからセッションを出す。**
      以前は `/auth/consent` へ寄り道させていたが、ログイン画面にも同意の
      トグルが要るようになり、同じ同意を2回取ることになっていた。
    */
    if (!user.lastTermsAcceptedAt) {
      await recordTermsAcceptance(user.id)
    }

    // ログイン情報の更新（IP・最終ログイン日時）
    await updateUserLoginInfo(user.id, request)
    
    // セッションクッキーを設定してリダイレクト
    const redirectUrl = getSafeRedirectUrl(stateInfo.callbackUrl, baseUrl, '/')
    const response = await issueSessionRedirect(user, redirectUrl)
    return clearOAuthSession(response)
  } catch (error) {
    console.error('Error in Discord callback:', error)
    const errorResponse = NextResponse.redirect(`${baseUrl}/auth/error?error=internal_error`)
    return clearOAuthSession(errorResponse)
  }
}