-- 運営からのお知らせ。従来のファイル（src/announcements/*.md）を廃止し DB 管理へ移す。
-- 出すたびにデプロイが要る状態と、バナーへの掲載期間を持てない状態の両方を解消する。
CREATE TABLE "announcements" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'info',
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "pinnedUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_publishedAt_idx" ON "announcements"("publishedAt");
