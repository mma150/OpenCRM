import { defineConfig } from "vitest/config";

import { getTestDatabaseUrl, resolveDatabaseUrl } from "./test/global-setup.ts";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // One shared test database, so test files run one after another.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      // Tests never use the development database (T-04-01).
      DATABASE_URL: getTestDatabaseUrl(resolveDatabaseUrl()),
      CORS_ORIGINS: "http://localhost:3000",
    },
  },
});
