import { prisma } from "../../lib/prisma";

// The service is the only layer that touches Prisma (D-09).
export async function getHealth() {
  const rows = await prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
  const row = rows[0];
  if (!row) {
    throw new Error("Health query returned no rows");
  }
  return {
    status: "ok" as const,
    database: { connected: true, serverTime: row.now.toISOString() },
  };
}
