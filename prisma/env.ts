import { existsSync } from 'node:fs'

/**
 * `.env` を読み込む。
 *
 * Prisma 7 の CLI も tsx も .env を読まない（Next は読む）。読ませないと
 * seed も運用スクリプトも `prisma migrate` も接続先が空のまま落ちる。
 *
 * dotenv は入れない。Node 24 に `process.loadEnvFile` がある。
 * 読む順と、**実行環境に既に入っている値を勝たせる**ところは Next に合わせる
 * （本番の移行はファイルではなく環境変数から来る）。
 */
export function loadEnvFiles() {
  const fromEnvironment = { ...process.env }
  for (const file of ['.env', '.env.local']) {
    if (existsSync(file)) process.loadEnvFile(file)
  }
  Object.assign(process.env, fromEnvironment)
}
