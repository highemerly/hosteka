-- Mastodon / Pleroma に登録した OAuth アプリを使い回すためのテーブル。
-- 新規テーブルとインデックスのみで、既存テーブルには一切触れない（追加のみ）。
-- 空で始まり、最初のログインで登録した時点で行ができる。

-- CreateTable
CREATE TABLE "oauth_apps" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "server" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "oauth_apps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_apps_platform_server_redirectUri_scopes_key" ON "oauth_apps"("platform", "server", "redirectUri", "scopes");
