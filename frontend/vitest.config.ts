import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // Resolves the `@/` alias from tsconfig.json paths.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Lets src/env.ts parse in tests without a .env file.
    env: { NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1" },
  },
});
