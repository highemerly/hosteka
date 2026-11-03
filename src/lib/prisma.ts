import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'

/*
  Prisma 7 は接続をドライバアダプタに任せる（Rust のクエリエンジンが無くなった）。
  接続先はスキーマではなくここで渡す。CLI（migrate / studio）の接続先は
  prisma.config.ts が別に持つ。
*/
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
