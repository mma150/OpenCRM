import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

// Redux and HTTP pattern rules (D-06). Each exception file re-states the rule
// without the one entry it is allowed to break, because a later config replaces
// the rule rather than merging with it.
const untypedReduxHooks = {
  name: "react-redux",
  importNames: ["useDispatch", "useSelector", "useStore"],
  message:
    "Use useAppDispatch and useAppSelector from @/store/hooks instead of the untyped react-redux hooks (D-06).",
};
const axiosOutsideHttp = {
  name: "axios",
  message: "Use the shared axios instance `http` from @/lib/api/http (D-06).",
};
const rtkQuery = {
  group: ["@reduxjs/toolkit/query", "@reduxjs/toolkit/query/*"],
  message: "RTK Query is not used in this project. Use createAsyncThunk (D-06).",
};

export default defineConfig([
  globalIgnores([
    ".next",
    "node_modules",
    "next-env.d.ts",
    "src/components/ui",
    "src/lib/api/schema.d.ts",
  ]),

  ...nextVitals,
  ...nextTs,
  tseslint.configs.strictTypeChecked,

  {
    languageOptions: {
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
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // File names are kebab-case (D-20).
      "unicorn/filename-case": ["error", { case: "kebabCase" }],
      "no-restricted-imports": [
        "error",
        { paths: [untypedReduxHooks, axiosOutsideHttp], patterns: [rtkQuery] },
      ],
      // Only src/env.ts reads process.env, so a bad variable is reported once, by name,
      // and no secret can reach the browser bundle by accident.
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Read configuration through `env` from @/env instead of process.env.",
        },
      ],
    },
  },

  // The one place allowed to read process.env.
  {
    files: ["src/env.ts"],
    rules: { "no-restricted-properties": "off" },
  },

  // The typed hooks live here, so this is the only file that may import the raw ones.
  {
    files: ["src/store/hooks.ts"],
    rules: {
      "no-restricted-imports": ["error", { paths: [axiosOutsideHttp], patterns: [rtkQuery] }],
    },
  },
  // The shared axios instance lives here, so this is the only file that may import axios.
  {
    files: ["src/lib/api/http.ts"],
    rules: {
      "no-restricted-imports": ["error", { paths: [untypedReduxHooks], patterns: [rtkQuery] }],
      // The response interceptor rejects with the plain-object ApiError on purpose:
      // slices and components read `code` and `message`, never an axios or Error instance.
      "@typescript-eslint/prefer-promise-reject-errors": "off",
    },
  },

  // Config files and plain .mjs files are not part of the type-checked program.
  {
    files: ["**/*.mjs", "**/*.config.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Keep last: switches off every rule that Prettier handles.
  prettier,
]);
