import 'server-only'

import { cookies, headers } from 'next/headers'

import { COOKIE_SESSION } from '@/lib/cookie-names'
import { readGeoFromHeaders } from '@/lib/geo'
import { prisma } from '@/lib/prisma'
import { getClientIPFromHeaders } from '@/lib/user-tracking'

import { SESSION_MAX_AGE_SEC, signSession, verifySession } from './jwt'
import { isRevoked, markRevokedLocally } from './revocation-cache'
import { touchSession } from './session-activity'
import type { Viewer } from './cookies'

/** DBに触れずに得られる情報だけを持つ軽量なコンテキスト */
export type SessionClaimsCtx = {
  userId: string
  sessionId: string
  /** UI 出し分け用のヒント。権限判定に使ってはいけない（requireAdmin を使う） */
  isAdminHint: boolean
}

/**
 * 認可の入力になる値だけを持つ。**表示用の値（名前・アイコン）は載せない** —
 * 画面は viewer cookie か各 API の DTO から取る。
 */
export type SessionUser = {
  id: string
  platform: string
  username: string
  server: string
  isAdmin: boolean
}

export type Session = { user: SessionUser; sessionId: string }

/**
 * Cookie の JWT を検証し、失効していないことを確認する。**DBには触れない**
 * （失効判定はプロセス内キャッシュが担当する）。
 */
export async function getSessionClaims(): Promise<SessionClaimsCtx | null> {
  const store = await cookies()
  const token = store.get(COOKIE_SESSION)?.value
  if (!token) return null

  const claims = await verifySession(token)
  if (!claims) return null

  if (await isRevoked(claims.sid)) return null

  return { userId: claims.sub, sessionId: claims.sid, isAdminHint: claims.adm }
}

/**
 * ユーザー情報まで解決したセッション。
 *
 * ここでは users を1行引く（インデックス済みの主キー参照）。トークンに
 * username / server / platform を焼き込まない代わりの読み取りで、これらは
 * 参加可否を決める認可の入力なので常に最新である必要がある。
 */
export async function getSession(): Promise<Session | null> {
  const claims = await getSessionClaims()
  if (!claims) return null

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: {
      id: true,
      username: true,
      server: true,
      platform: true,
      isAdmin: true,
    },
  })
  // ユーザーが削除済みならセッションも無効
  if (!user) return null

  // 「最終利用」を進める。最大1時間に1回で、応答は待たせない
  touchSession(claims.sessionId)

  return {
    sessionId: claims.sessionId,
    user: {
      id: user.id,
      platform: user.platform,
      username: user.username,
      server: user.server,
      isAdmin: user.isAdmin,
    },
  }
}

/** 管理者判定は必ずDBで確認する。トークンの adm はヒントに過ぎない */
export async function isAdminUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  })
  return user?.isAdmin === true
}

/** ログイン時にセッション行を作り、署名済みトークンと viewer 情報を返す */
export async function createSession(user: {
  id: string
  displayName: string
  username: string
  server: string
  platform: string
  avatar: string | null
  isAdmin: boolean
}): Promise<{ token: string; viewer: Omit<Viewer, 'v'> }> {
  const headerList = await headers()
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000)

  /*
    ログインした場所。**記録するのはここだけ。** セッションの一覧で
    「自分の心当たりと合うか」を確かめるためのもので、
    後から辿り直せる値ではない（`lastUsedAt` は更新するが場所は追わない）。
  */
  const geo = readGeoFromHeaders(headerList)

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      expiresAt,
      userAgent: headerList.get('user-agent')?.slice(0, 255) ?? null,
      ipAddress: getClientIPFromHeaders(headerList).slice(0, 64),
      country: geo.country,
      region: geo.region,
    },
    select: { id: true },
  })

  const token = await signSession({
    userId: user.id,
    sessionId: session.id,
    isAdmin: user.isAdmin,
  })

  return {
    token,
    viewer: {
      id: user.id,
      name: user.displayName,
      avatar: user.avatar,
      isAdmin: user.isAdmin,
      username: user.username,
      server: user.server,
      platform: user.platform,
    },
  }
}

/**
 * 1セッションを失効させる。実行したポッドでは即座に反映する。
 *
 * ★ 行の削除は失効ではない ★
 * 失効キャッシュは revokedAt が入った行だけを見るため、sessions 行を
 * DELETE しても発行済みJWTは有効期限まで通ってしまう。ユーザー削除など
 * cascade で行が消える経路では、**削除の前に**この関数（または
 * revokeUserSessions）を呼ぶこと。
 */
export async function revokeSession(sessionId: string): Promise<void> {
  const session = await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
    select: { expiresAt: true },
  })
  markRevokedLocally(sessionId, session.expiresAt)
}

/**
 * ユーザーの全セッションを失効させる。
 * BAN や管理者権限の変更時に呼ぶ（トークンに焼かれた古い権限を無効化するため）。
 *
 * `exceptSessionId` を渡すと、そのセッションだけ残す（利用者自身が
 * 「ほかの端末をログアウト」するとき）。**除外は SQL の条件で書く。**
 * 一覧を取ってから配列で除くと、間に増えたセッションを取りこぼす。
 */
export async function revokeUserSessions(
  userId: string,
  options?: { exceptSessionId?: string }
): Promise<number> {
  const where = {
    userId,
    revokedAt: null,
    ...(options?.exceptSessionId ? { NOT: { id: options.exceptSessionId } } : {}),
  }

  const targets = await prisma.session.findMany({
    where,
    select: { id: true, expiresAt: true },
  })
  if (targets.length === 0) return 0

  await prisma.session.updateMany({ where, data: { revokedAt: new Date() } })
  for (const t of targets) markRevokedLocally(t.id, t.expiresAt)
  return targets.length
}
