import { AppError } from "../../lib/app-error";
import { prisma } from "../../lib/prisma";

// The service is the only layer that touches Prisma (D-09).
export async function getHealth() {
  let rows: { now: Date }[];
  try {
    rows = await prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
  } catch (error) {
    throw new AppError("SERVICE_UNAVAILABLE", 503, "Database is unavailable", null, {
      cause: error,
    });
  }
  const row = rows[0];
  if (!row) {
    throw new Error("Health query returned no rows");
  }
  return {
    status: "ok" as const,
    database: { connected: true, serverTime: row.now.toISOString() },
  };
}
