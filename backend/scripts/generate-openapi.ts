import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Importing the routes loads src/env.ts, which needs DATABASE_URL. Generating the
// document never connects to the database, so fall back to the example values.
// loadEnvFile never overrides a variable that is already set (CI, Compose, your shell).
process.loadEnvFile(fileURLToPath(new URL("../.env.example", import.meta.url)));

// Imported after the line above on purpose (a static import would run first).
const { buildOpenApiDocument } = await import("../src/lib/openapi");
// Loading the routes makes every module register its paths.
await import("../src/routes");

const outputUrl = new URL("../openapi/openapi.json", import.meta.url);
mkdirSync(new URL("./", outputUrl), { recursive: true });

// Two-space indent and a trailing newline, so the output is stable and diffs stay small.
writeFileSync(outputUrl, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`);

console.log(`Wrote ${fileURLToPath(outputUrl)}`);
