# syntax=docker/dockerfile:1

# ============================================
# Stage 1: 依存関係のインストール
# ============================================
FROM node:24-alpine AS deps
WORKDIR /app

# libc6-compat は Alpine で一部のnpmパッケージに必要
RUN apk add --no-cache libc6-compat

# パッケージファイルをコピー
COPY package.json package-lock.json* ./

# 依存関係をインストール（キャッシュマウントで高速化）
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ============================================
# Stage 2: Prisma クライアント生成
# ============================================
FROM deps AS prisma
WORKDIR /app

# Prisma スキーマだけ先にコピー（スキーマ変更時のみ再実行）
COPY prisma ./prisma
# Prisma 7 の CLI は prisma.config.ts を読む（接続先とマイグレーションの置き場）
COPY prisma.config.ts ./

# Prisma 7 の生成先は node_modules ではなく src/generated/prisma。
# 中身は TypeScript なので、この後の build がソースとして取り込む。
RUN npx prisma generate

# ============================================
# Stage 3: ビルド
# ============================================
FROM node:24-alpine AS builder
WORKDIR /app

# 依存関係をコピー
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 生成した Prisma クライアント（ソース）を後から重ねる。
# .dockerignore で除外されるため COPY . . では入らない。
COPY --from=prisma /app/src/generated ./src/generated

# 公開URL。静的なページ（トップ・一覧・FAQ など）の HTML はここで作られるので、
# リンクカードの画像の絶対URLを焼き込むにはビルドのときに要る（`publicBaseUrl`）。
# 実行時の値は k8s が同じ名前で渡す。渡さなければ画像を載せない（localhost を配らない）。
# このステージの RUN にだけ見える（実行時のイメージには残らない）
ARG NEXTAUTH_URL

# Next.js ビルド（キャッシュマウントで高速化）
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# ============================================
# Stage 4: 本番実行環境
# ============================================
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# セキュリティ: 非rootユーザーで実行
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# standalone出力をコピー
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# **Prisma の CLI は積まない。** マイグレーションは手元から port-forward して当てる
# （docs/development.md「リリース」）。Prisma 7 の CLI は依存（effect など）を
# 丸ごと要するので、積むならイメージが太る。アプリが使うクライアントは
# standalone 側に取り込まれている。

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Next.js standaloneサーバーを起動
CMD ["node", "server.js"]
