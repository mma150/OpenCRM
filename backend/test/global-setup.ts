import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import pg from "pg";

const TEST_DATABASE_NAME = "opencrm_test";

const backendDir = fileURLToPath(new URL("..", import.meta.url));

/** Same server and credentials as `databaseUrl`, but the database is `opencrm_test`. */
export function getTestDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${TEST_DATABASE_NAME}`;
  return url.toString();
}

/**
 * The development DATABASE_URL: from the process environment (Compose, CI), otherwise from
 * backend/.env and then backend/.env.example. loadEnvFile never overrides a variable that
 * is already set, so the file read first wins.
 */
export function resolveDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    for (const file of [".env", ".env.example"]) {
      const path = fileURLToPath(new URL(`../${file}`, import.meta.url));
      if (existsSync(path)) {
        process.loadEnvFile(path);
      }
    }
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set and not found in backend/.env or .env.example");
  }
  return databaseUrl;
}

// Creates opencrm_test when it does not exist yet, then applies the migrations to it.
// Safe to run repeatedly, including after an interrupted run.
async function ensureTestDatabase(databaseUrl: string): Promise<void> {
  const maintenanceUrl = new URL(databaseUrl);
  maintenanceUrl.pathname = "/postgres";

  const client = new pg.Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      TEST_DATABASE_NAME,
    ]);
    if (existing.rowCount === 0) {
      // CREATE DATABASE cannot take a bind parameter; the name is the constant above.
      await client.query(`CREATE DATABASE ${TEST_DATABASE_NAME}`);
    }
  } finally {
    await client.end();
  }
}

function migrateTestDatabase(testDatabaseUrl: string): void {
  const prismaCli = fileURLToPath(
    new URL("../node_modules/prisma/build/index.js", import.meta.url),
  );
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
    stdio: "inherit",
  });
}

export default async function setup(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();
  await ensureTestDatabase(databaseUrl);
  migrateTestDatabase(getTestDatabaseUrl(databaseUrl));
}
