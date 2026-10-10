import { copyFileSync } from "node:fs";

import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node24",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // src/lib/password.ts reads this list from beside the running file.
  onSuccess: () => {
    copyFileSync("src/lib/common-passwords.txt", "dist/common-passwords.txt");
    return Promise.resolve();
  },
});
