import 'server-only'

import { DatabaseConnectionError } from '@/lib/errors'
import { Prisma } from '@/generated/prisma/client'

/**
 * Prisma のエラーがデータベース接続エラーかどうかを判定する。
 *
 * **サーバー専用。** `Prisma` を値として使うため、クライアントから
 * 読める場所に置くと生成クライアントがブラウザのチャンクに入り、
 * 本番ビルドが落ちる。名前だけで判定する版（クライアント側の
 * error.tsx が使う）は `src/lib/errors.ts`。
 */
export function isDatabaseConnectionError(error: unknown): boolean {
  if (error instanceof DatabaseConnectionError) {
    return true
  }

  // PrismaClientInitializationError: 接続初期化失敗
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true
  }

  // PrismaClientKnownRequestError: 特定のエラーコード
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2024: 接続プールのタイムアウト
    if (error.code === 'P2024') {
      return true
    }
  }

  // エラーメッセージによる判定（Prisma以外のエラーも含む）
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    const connectionErrorPatterns = [
      "can't reach database server",
      'cannot reach database server',
      'connection refused',
      'econnrefused',
      'connection timed out',
      'etimedout',
      'database is not reachable',
      'unable to connect to database',
      'connection to database lost',
      'too many connections',
      'connection pool timeout',
    ]

    return connectionErrorPatterns.some((pattern) => message.includes(pattern.toLowerCase()))
  }

  return false
}
