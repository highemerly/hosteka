import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // DBへの接続確認
    await prisma.$queryRaw`SELECT 1`

    return NextResponse.json({
      app: 'ok',
      database: 'ok',
      status: 'healthy',
    })
  } catch (error) {
    console.error('Health check failed:', error)
    return NextResponse.json(
      {
        app: 'ok',
        database: 'error',
        status: 'unhealthy',
      },
      { status: 503 }
    )
  }
}
