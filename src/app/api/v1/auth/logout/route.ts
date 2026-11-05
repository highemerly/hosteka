export const dynamic = 'force-dynamic'

import { NextResponse, type NextRequest } from 'next/server'

import { clearSessionCookies } from '@/server/auth/cookies'
import { getSessionClaims, revokeSession } from '@/server/auth/session'
import { rejectCrossOrigin } from '@/server/http/same-origin'

/**
 * ログアウト。
 *
 * Cookie を消すだけでは不十分で、DB 上のセッションも失効させる。
 * 消し忘れたトークンのコピー（拡張機能・別タブ・ログ等に残ったもの）が
 * 有効期限まで使えてしまうため。
 *
 * **別サイトからの要求は断る。** Cookie を読まずに消すので、`SameSite` では
 * 止まらない（別サイトのページから、勝手にログアウトさせられる）。
 */
export async function POST(request: NextRequest) {
  const rejected = rejectCrossOrigin(request)
  if (rejected) return rejected

  const response = NextResponse.json({ success: true })

  try {
    const claims = await getSessionClaims()
    if (claims) {
      await revokeSession(claims.sessionId)
    }
  } catch (error) {
    // 失効に失敗しても Cookie は必ず消す。ここで失敗を返すと
    // 「ログアウトできない」状態にユーザーを閉じ込めてしまう。
    console.error('Logout: failed to revoke session', error)
  }

  clearSessionCookies(response)
  return response
}
