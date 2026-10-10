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
      APP_URL: "http://localhost:3000",
      TRUST_PROXY: "0",
      SESSION_COOKIE_SECURE: "false",
      // Outgoing email is off in tests, whatever the surrounding environment says.
      // Tests that need email stand in for the mailer (test/helpers.ts).
      SMTP_HOST: "",
      MAIL_FROM: "OpenCRM Test <test@opencrm.local>",
      // A test-only key for the secrets the app encrypts (lib/secret-box.ts).
      SETTINGS_ENCRYPTION_KEY: "test-only-settings-encryption-key-0001",
    },
  },
});
