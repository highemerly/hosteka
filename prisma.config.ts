import { existsSync } from 'node:fs'

import { defineConfig } from 'prisma/config'

/*
  Prisma 7 の CLI は .env を読まない（Next は読む）。読ませないと
  `prisma migrate` の接続先が空になるので、ここで Next と同じ順で読む。

  dotenv は入れない。Node 24 に `process.loadEnvFile` がある。
  実行環境に既に入っている値を勝たせるのも Next と同じ
  （本番の移行はファイルではなく環境変数から来る）。
*/
const fromEnvironment = { ...process.env }
for (const file of ['.env', '.env.local']) {
  if (existsSync(file)) process.loadEnvFile(file)
}
Object.assign(process.env, fromEnvironment)

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'npx tsx prisma/seed.ts',
  },
  /*
    `env('DATABASE_URL')` は未定義だと**読み込み時に**投げる。CI は
    DB を持たないまま `prisma generate` を走らせる（型が要るだけ）ので、
    それでは生成すら通らない。空で渡し、実際に接続する副コマンドだけが
    失敗するようにしておく。
  */
  datasource: { url: process.env.DATABASE_URL ?? '' },
})
