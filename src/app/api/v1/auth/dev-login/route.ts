export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { issueSessionJson } from '@/server/auth/oauth-callback'
import { encryptAccessToken } from '@/lib/crypto'
import { normalizeUsername, normalizeServer } from '@/lib/normalize'

export async function POST(request: NextRequest) {
  // 厳密な開発環境チェック
  if (process.env.NODE_ENV !== 'development' || !process.env.DEV_MODE_ENABLED) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 本番環境での誤動作を防ぐ追加チェック
  if (process.env.NEXTAUTH_URL && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(process.env.NEXTAUTH_URL)) {
    return NextResponse.json({ error: 'Dev login disabled in production environment' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // テストユーザーの定義
    const testUsers = {
      user1: { username: 'alice', server: 'handon.club', displayName: 'Alice (主催者)' },
      user2: { username: 'bob', server: 'mastodon.social', displayName: 'Bob (参加者)' },
      user3: { username: 'charlie', server: 'fedibird.com', displayName: 'Charlie (観察者)' },
    }

    const selectedUser = testUsers[userId as keyof typeof testUsers]
    if (!selectedUser) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
    }

    const { username, server, displayName } = selectedUser
    const normalizedUsername = normalizeUsername(username)
    const normalizedServer = normalizeServer(server)

    // 開発用ユーザーを作成または更新
    const user = await prisma.user.upsert({
      where: {
        username_server: {
          username: normalizedUsername,
          server: normalizedServer,
        },
      },
      update: {
        displayName: displayName,
        avatar: `https://via.placeholder.com/150?text=${username[0].toUpperCase()}`,
        updatedAt: new Date(),
      },
      create: {
        username: normalizedUsername,
        displayName: displayName,
        avatar: `https://via.placeholder.com/150?text=${username[0].toUpperCase()}`,
        server: normalizedServer,
        platform: 'mastodon',
        accessToken: encryptAccessToken('dev-token'),
        // 開発ユーザーは同意済みとして作成
        lastTermsAcceptedAt: new Date(),
      },
    })

    // 本番と同じ経路でセッションを発行する。開発用の抜け道を別実装にすると、
    // 本番の発行経路だけが壊れていても気づけなくなるため。
    return issueSessionJson(user, {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        server: user.server,
      },
    })
  } catch (error) {
    console.error('Error in dev login:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}