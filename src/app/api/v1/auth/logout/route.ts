export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import { clearSessionCookies } from '@/server/auth/cookies'
import { getSessionClaims, revokeSession } from '@/server/auth/session'

/**
 * ログアウト。
 *
 * Cookie を消すだけでは不十分で、DB 上のセッションも失効させる。
 * 消し忘れたトークンのコピー（拡張機能・別タブ・ログ等に残ったもの）が
 * 有効期限まで使えてしまうため。
 */
export async function POST() {
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
