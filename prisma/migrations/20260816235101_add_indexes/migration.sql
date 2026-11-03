-- 一覧クエリ向けのインデックス追加。
-- 全て CREATE INDEX のみで、既存データ・列定義には一切触れない（追加のみ）。
-- 対象テーブルが100万行を超える規模になった場合は CREATE INDEX CONCURRENTLY へ
-- 書き換え、トランザクション外で実行すること（本マイグレーションは通常のロックを取る）。

-- CreateIndex
CREATE INDEX "events_isPublic_isDisabled_startDate_idx" ON "events"("isPublic", "isDisabled", "startDate");

-- CreateIndex
CREATE INDEX "events_creatorId_idx" ON "events"("creatorId");

-- CreateIndex
CREATE INDEX "events_organizationId_idx" ON "events"("organizationId");

-- CreateIndex
CREATE INDEX "events_startDate_idx" ON "events"("startDate");

-- CreateIndex
CREATE INDEX "event_participants_userId_status_idx" ON "event_participants"("userId", "status");

-- CreateIndex
CREATE INDEX "event_participants_eventId_status_idx" ON "event_participants"("eventId", "status");

-- CreateIndex
CREATE INDEX "pre_events_isPublic_isDisabled_createdAt_idx" ON "pre_events"("isPublic", "isDisabled", "createdAt");

-- CreateIndex
CREATE INDEX "pre_events_creatorId_idx" ON "pre_events"("creatorId");

-- CreateIndex
CREATE INDEX "pre_events_organizationId_idx" ON "pre_events"("organizationId");

-- CreateIndex
CREATE INDEX "pre_event_participants_userId_idx" ON "pre_event_participants"("userId");

-- CreateIndex
CREATE INDEX "pre_event_participants_preEventId_idx" ON "pre_event_participants"("preEventId");

-- CreateIndex
CREATE INDEX "service_terms_acceptances_userId_idx" ON "service_terms_acceptances"("userId");

-- CreateIndex
CREATE INDEX "reports_status_reportedAt_idx" ON "reports"("status", "reportedAt");

-- CreateIndex
CREATE INDEX "event_attendances_eventId_idx" ON "event_attendances"("eventId");

-- CreateIndex
CREATE INDEX "organization_admins_userId_idx" ON "organization_admins"("userId");

