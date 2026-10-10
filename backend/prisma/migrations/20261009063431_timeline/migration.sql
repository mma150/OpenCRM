-- CreateEnum
CREATE TYPE "TimelineKind" AS ENUM ('CONVERSATION', 'NOTE', 'CREATED', 'STATUS_CHANGE', 'ASSIGNMENT');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('CALL', 'MEETING', 'EMAIL', 'MESSAGE');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "lastContactAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TimelineEntry" (
    "id" TEXT NOT NULL,
    "kind" "TimelineKind" NOT NULL,
    "conversationType" "ConversationType",
    "body" TEXT,
    "details" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimelineEntry_leadId_occurredAt_idx" ON "TimelineEntry"("leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "TimelineEntry_authorId_occurredAt_idx" ON "TimelineEntry"("authorId", "occurredAt");

-- CreateIndex
CREATE INDEX "TimelineEntry_occurredAt_idx" ON "TimelineEntry"("occurredAt");

-- CreateIndex
CREATE INDEX "TimelineEntry_kind_idx" ON "TimelineEntry"("kind");

-- CreateIndex
CREATE INDEX "Lead_lastContactAt_idx" ON "Lead"("lastContactAt");

-- AddForeignKey
ALTER TABLE "TimelineEntry" ADD CONSTRAINT "TimelineEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEntry" ADD CONSTRAINT "TimelineEntry_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every lead that already exists gets its CREATED entry, dated when the lead was
-- created and authored by whoever created it.
INSERT INTO "TimelineEntry" ("id", "kind", "occurredAt", "authorId", "leadId", "createdAt")
SELECT gen_random_uuid()::text, 'CREATED', "createdAt", "createdById", "id", "createdAt"
FROM "Lead";
