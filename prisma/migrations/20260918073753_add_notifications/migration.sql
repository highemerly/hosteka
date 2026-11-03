-- アプリ内の通知。
--
-- 新規テーブル1つと、`users` への列1つの追加のみ。**既存のデータは書き換えない。**
--
-- `users.notificationsSeenAt`（通知をどこまで見たか）は NOT NULL だが、既定値が
-- あるので backfill は要らない。この時点で notifications は空なので、既存の行が
-- 「今この瞬間まで読んだ」ことになっても失われるものが無い。
--
-- `notifications` の一意制約は畳みのためのもの。`foldKey` は NULL を許し、
-- Postgres が NULL どうしを別物として扱うことを利用している（「畳まない」種別の
-- 行はいくつでも作れる）。詳しくは schema.prisma の doc コメント。

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notificationsSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "actorId" TEXT,
    "payload" TEXT,
    "foldKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "repeatCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_userId_occurredAt_idx" ON "notifications"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "notifications_targetType_targetId_idx" ON "notifications"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_actorId_idx" ON "notifications"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_kind_targetType_targetId_foldKey_key" ON "notifications"("userId", "kind", "targetType", "targetId", "foldKey");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
