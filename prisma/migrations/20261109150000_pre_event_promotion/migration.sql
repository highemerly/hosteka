-- AlterTable
ALTER TABLE "pre_events" ADD COLUMN     "promotedAt" TIMESTAMPTZ(3),
ADD COLUMN     "promotedDateOptionId" TEXT,
ADD COLUMN     "promotedEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pre_events_promotedEventId_key" ON "pre_events"("promotedEventId");

-- AddForeignKey
ALTER TABLE "pre_events" ADD CONSTRAINT "pre_events_promotedEventId_fkey" FOREIGN KEY ("promotedEventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

