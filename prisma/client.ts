import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../src/generated/prisma/client'
import { loadEnvFiles } from './env'

/**
 * CLI から使う Prisma 接続（seed と scripts/ の運用スクリプト）。
 *
 * アプリ側は `src/lib/prisma.ts` を使う。あちらはリクエスト間で使い回す
 * シングルトンで、環境変数は Next が読む。こちらは1回きりの実行なので
 * 使い回さず、.env を自分で読む。
 */
loadEnvFiles()

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})
