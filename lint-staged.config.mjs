// Runs before every commit (see .husky/pre-commit): auto-fixes the staged files of the
// two apps with that app's own ESLint and Prettier. Files outside backend/ and frontend/
// are not formatted: the root package has no formatter.
//
// mobile/ is left out on purpose: formatting Dart needs the Flutter SDK, and a commit must
// not fail on a machine without it. Run `dart format .` in mobile/ before committing; the
// `mobile` job in CI fails on an unformatted file (docs/standards/mobile.md).
//
// Each tool runs from inside its app folder, so it reads that app's config. The tools are
// started with node straight from the app's node_modules, so this works with any pnpm
// version on the contributor's machine.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Files that get ESLint (with fix) and then Prettier.
const CODE_FILES = "{js,jsx,mjs,cjs,ts,tsx,mts,cts}";
// Files that only get Prettier.
const TEXT_FILES = "{md,json,css,yml,yaml}";

function runInApp(appDir, scriptPath, args, log) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: appDir,
    encoding: "utf8",
  });
  const output = `${result.stdout}${result.stderr}`.trim();
  if (output) log("%s", output);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(scriptPath)} exited with code ${String(result.status)}`);
  }
}

// Builds the lint-staged task for one app. `fix` adds ESLint before Prettier.
function appTask(app, title, { fix }) {
  const appDir = path.join(rootDir, app);
  const eslint = path.join(appDir, "node_modules", "eslint", "bin", "eslint.js");
  const prettier = path.join(appDir, "node_modules", "prettier", "bin", "prettier.cjs");

  return {
    title,
    task: (stagedFiles, { log }) => {
      if (!existsSync(eslint) || !existsSync(prettier)) {
        throw new Error(
          `${app}/node_modules is missing. Run "pnpm install" inside ${app}/ and commit again.`,
        );
      }
      const files = stagedFiles.map((file) => path.relative(appDir, file));
      if (fix) {
        runInApp(
          appDir,
          eslint,
          ["--fix", "--max-warnings", "0", "--no-warn-ignored", "--", ...files],
          log,
        );
      }
      runInApp(appDir, prettier, ["--write", "--", ...files], log);
    },
  };
}

export default {
  [`backend/**/*.${CODE_FILES}`]: appTask("backend", "backend: ESLint --fix and Prettier", {
    fix: true,
  }),
  [`backend/**/*.${TEXT_FILES}`]: appTask("backend", "backend: Prettier", { fix: false }),
  [`frontend/**/*.${CODE_FILES}`]: appTask("frontend", "frontend: ESLint --fix and Prettier", {
    fix: true,
  }),
  [`frontend/**/*.${TEXT_FILES}`]: appTask("frontend", "frontend: Prettier", { fix: false }),
};
