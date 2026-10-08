import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist", "node_modules", "src/generated", "openapi"]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,

  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "simple-import-sort": simpleImportSort, unicorn },
    rules: {
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      // Express error middleware must declare four arguments even when it ignores some.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // File names are kebab-case (D-20).
      "unicorn/filename-case": ["error", { case: "kebabCase" }],
      // Only src/env.ts (and the files named in the override below) read process.env,
      // so a missing variable is reported once, by name, at start-up.
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Read configuration through `env` from src/env.ts instead of process.env.",
        },
      ],
    },
  },

  // Layering (D-09): routes -> controller -> service -> Prisma.
  {
    files: ["**/*.controller.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/lib/prisma", "**/generated/prisma", "**/generated/prisma/*"],
              message: "Controllers must not touch Prisma. Call a service instead (D-09).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.routes.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/*.service", "**/*.service.*"],
              message: "Routes must not import services. Go through the controller (D-09).",
            },
          ],
        },
      ],
    },
  },

  // The places that are allowed to read process.env.
  {
    files: ["src/env.ts", "prisma.config.ts", "test/global-setup.ts"],
    rules: { "no-restricted-properties": "off" },
  },

  // Config files and plain .mjs files are not part of the type-checked program.
  {
    files: ["**/*.mjs", "**/*.config.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Keep last: switches off every rule that Prettier handles.
  prettier,
]);
