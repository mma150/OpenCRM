-- CreateEnum
CREATE TYPE "StageKind" AS ENUM ('OPEN', 'WON', 'LOST');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "convertedAt" TIMESTAMP(3),
ADD COLUMN     "convertedCompanyId" TEXT,
ADD COLUMN     "convertedContactId" TEXT,
ADD COLUMN     "convertedOpportunityId" TEXT;

-- AlterTable
ALTER TABLE "TimelineEntry" ADD COLUMN     "opportunityId" TEXT;

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "StageKind" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expectedCloseDate" DATE,
    "stageId" TEXT NOT NULL,
    "closeReason" TEXT,
    "closedAt" TIMESTAMP(3),
    "contactId" TEXT,
    "companyId" TEXT,
    "notes" TEXT,
    "lastContactAt" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineStage_kind_position_idx" ON "PipelineStage"("kind", "position");

-- CreateIndex
CREATE INDEX "Opportunity_ownerId_idx" ON "Opportunity"("ownerId");

-- CreateIndex
CREATE INDEX "Opportunity_stageId_idx" ON "Opportunity"("stageId");

-- CreateIndex
CREATE INDEX "Opportunity_companyId_idx" ON "Opportunity"("companyId");

-- CreateIndex
CREATE INDEX "Opportunity_contactId_idx" ON "Opportunity"("contactId");

-- CreateIndex
CREATE INDEX "Opportunity_name_idx" ON "Opportunity"("name");

-- CreateIndex
CREATE INDEX "Opportunity_value_idx" ON "Opportunity"("value");

-- CreateIndex
CREATE INDEX "Opportunity_expectedCloseDate_idx" ON "Opportunity"("expectedCloseDate");

-- CreateIndex
CREATE INDEX "Opportunity_createdAt_idx" ON "Opportunity"("createdAt");

-- CreateIndex
CREATE INDEX "Opportunity_updatedAt_idx" ON "Opportunity"("updatedAt");

-- CreateIndex
CREATE INDEX "Lead_convertedContactId_idx" ON "Lead"("convertedContactId");

-- CreateIndex
CREATE INDEX "Lead_convertedOpportunityId_idx" ON "Lead"("convertedOpportunityId");

-- CreateIndex
CREATE INDEX "TimelineEntry_opportunityId_occurredAt_idx" ON "TimelineEntry"("opportunityId", "occurredAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedContactId_fkey" FOREIGN KEY ("convertedContactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedCompanyId_fkey" FOREIGN KEY ("convertedCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedOpportunityId_fkey" FOREIGN KEY ("convertedOpportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEntry" ADD CONSTRAINT "TimelineEntry_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every entry belongs to exactly one record. Prisma cannot express a check constraint, so
-- it is replaced here to include the new column.
ALTER TABLE "TimelineEntry" DROP CONSTRAINT "TimelineEntry_one_record";
ALTER TABLE "TimelineEntry" ADD CONSTRAINT "TimelineEntry_one_record"
  CHECK (num_nonnulls("leadId", "contactId", "companyId", "opportunityId") = 1);

-- The default pipeline. An Admin can rename, add, reorder and delete the open stages; the
-- Won and Lost stages can only be renamed.
INSERT INTO "PipelineStage" ("id", "name", "position", "kind", "updatedAt") VALUES
  (gen_random_uuid(), 'New', 0, 'OPEN', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Qualified', 1, 'OPEN', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Proposal', 2, 'OPEN', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Negotiation', 3, 'OPEN', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Won', 0, 'WON', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Lost', 0, 'LOST', CURRENT_TIMESTAMP);
