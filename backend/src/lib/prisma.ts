import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "../env";
import { type Prisma, PrismaClient } from "../generated/prisma/client";

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

const USER_ADMINISTRATION_LOCK = 7_302_001;
const PIPELINE_STAGES_LOCK = 7_302_002;
const CUSTOM_FIELDS_LOCK = 7_302_003;

// Call first inside a transaction that checks something and then writes on the strength
// of it (first-run setup, the last-admin rule). PostgreSQL makes a second such transaction
// wait until the first has committed, so two requests cannot both pass the check.
export async function lockUserAdministration(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${USER_ADMINISTRATION_LOCK}::bigint)`;
}

// The same for a transaction that changes the pipeline stages (never fewer than one open
// stage, no two stages with one name, positions without gaps).
export async function lockPipelineStages(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PIPELINE_STAGES_LOCK}::bigint)`;
}

// The same for a transaction that changes the custom field definitions (no two fields of a
// record type with one label, never more fields in use than the cap).
export async function lockCustomFields(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CUSTOM_FIELDS_LOCK}::bigint)`;
}
