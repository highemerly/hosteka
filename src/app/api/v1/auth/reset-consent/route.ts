export const dynamic = 'force-dynamic'

import { getSession } from '@/server/auth/session'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(_req: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    // デバッグ用機能のため、開発環境でのみ利用可能にする
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'この機能は開発環境でのみ利用可能です' }, { status: 403 })
    }

    // ユーザーの同意をリセット
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        lastTermsAcceptedAt: null
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('同意リセット処理エラー:', error)
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 })
  }
}