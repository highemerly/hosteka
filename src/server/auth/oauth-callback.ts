import 'server-only'

import { NextResponse } from 'next/server'

import { createSession } from './session'
import { setSessionCookies } from './cookies'

/** createSession が必要とする最小のユーザー情報 */
export type SessionUserInput = {
  id: string
  displayName: string
  username: string
  server: string
  platform: string
  avatar: string | null
  isAdmin: boolean
}

/**
 * セッションを発行してリダイレクト応答を組み立てる。
 *
 * OAuth コールバック・同意完了・dev-login の3経路すべてがここを通る。
 * セッション行の作成・トークン署名・2つの Cookie の設定を1箇所に閉じることで、
 * 「片方の Cookie だけ設定してしまう」「セッション行を作らずにトークンだけ
 * 発行してしまう（＝失効できないセッションができる）」を防ぐ。
 */
export async function issueSessionRedirect(
  user: SessionUserInput,
  redirectUrl: string
): Promise<NextResponse> {
  const { token, viewer } = await createSession(user)
  const response = NextResponse.redirect(redirectUrl)
  setSessionCookies(response, token, viewer)
  return response
}

/**
 * リダイレクトを伴わない経路（JSON応答）用。
 *
 * **統一エンベロープに載せて返す。** クライアントは `api.post` で叩き、
 * `{ data }` を剥がした中身を受け取る。ここで素のオブジェクトを返すと、
 * 呼び出し側だけ `undefined` を掴む（実際 register ルートで起きた）。
 */
export async function issueSessionJson<T extends object>(
  user: SessionUserInput,
  data: T
): Promise<NextResponse> {
  const { token, viewer } = await createSession(user)
  const response = NextResponse.json({ data })
  setSessionCookies(response, token, viewer)
  return response
}
