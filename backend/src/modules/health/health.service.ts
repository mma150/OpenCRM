import { prisma } from "../../lib/prisma";

// The service is the only layer that touches Prisma (D-09).
export async function getHealth() {
  const rows = await prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
  return {
    status: "ok" as const,
    database: { connected: true, serverTime: rows[0].now.toISOString() },
  };
}
