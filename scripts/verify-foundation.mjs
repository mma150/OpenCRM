// Checks that the repository foundation is complete and consistent with itself.
// Run it with `pnpm verify:foundation` (or `node scripts/verify-foundation.mjs`) from
// anywhere; it finds the repository root from its own location.
//
// It prints one PASS or FAIL line per check, then WARN lines for owner-input
// placeholders that are still unfilled, and exits 1 if any check failed.
//
// No dependencies: only node: modules and the root commitlint configuration. Workflow
// and Dependabot files are checked as text (there is no YAML parser here on purpose), so
// every rule below is written against the layout those files actually use.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TYPES } from "../commitlint.config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Helpers

/** Text of a repository file with LF line endings. Throws when it cannot be read. */
function read(file) {
  const path = join(root, file);
  if (!existsSync(path)) {
    throw new Error(`${file} does not exist`);
  }
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

/** Parsed package.json. */
function readJson(file) {
  return JSON.parse(read(file));
}

/** Removes whole-line comments (workflow and Dependabot files). Line numbers are kept. */
function stripComments(text) {
  return text
    .split("\n")
    .map((line) => (line.trim().startsWith("#") ? "" : line))
    .join("\n");
}

/** Lines of a top-level key's block (everything indented under `key:`). */
function topLevelBlock(text, key) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (start === -1) return "";
  const block = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    block.push(line);
  }
  return block.join("\n");
}

/** Map of job id to job text, from a workflow file. */
function jobsOf(text) {
  const jobs = new Map();
  let current = null;
  for (const line of topLevelBlock(text, "jobs").split("\n")) {
    const match = /^ {2}([\w-]+):\s*$/.exec(line);
    if (match) {
      current = match[1];
      jobs.set(current, []);
    } else if (current) {
      jobs.get(current).push(line);
    }
  }
  return new Map([...jobs].map(([id, lines]) => [id, lines.join("\n")]));
}

/** Trigger names of a workflow (block style or the inline `on: [a, b]` style). */
function triggersOf(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^on:/.test(line));
  if (start === -1) return [];
  const inline = lines[start].slice(3).trim();
  if (inline) {
    return inline
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  }
  return topLevelBlock(text, "on")
    .split("\n")
    .map((line) => /^ {2}([\w-]+):/.exec(line)?.[1])
    .filter(Boolean);
}

/**
 * The hosted packages of a pubspec.yaml with their versions: `name: 1.2.3` lines directly
 * under dependencies and dev_dependencies. An SDK package (`flutter:` with `sdk: flutter`
 * on the next line) has no version on its own line and is left out.
 */
function pubspecVersions(text) {
  const versions = [];
  for (const group of ["dependencies", "dev_dependencies"]) {
    for (const line of topLevelBlock(stripComments(text), group).split(/\r?\n/)) {
      const match = /^ {2}([a-z0-9_]+):\s*["']?([^"'\s]+)["']?\s*$/.exec(line);
      if (match) versions.push([match[1], match[2]]);
    }
  }
  return versions;
}

/** Bodies of every `run:` step, as the text of the script. */
function runBodies(text) {
  const lines = text.split("\n");
  const bodies = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^(\s*(?:- )?)run:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    const keyColumn = match[1].length;
    const value = match[2].trim();
    if (/^[|>][+-]?\d*$/.test(value)) {
      const body = [];
      for (const line of lines.slice(i + 1)) {
        if (line.trim() !== "" && line.length - line.trimStart().length < keyColumn + 1) break;
        body.push(line);
      }
      bodies.push(body.join("\n"));
    } else {
      bodies.push(value);
    }
  }
  return bodies;
}

/** True when `commands` contains every item of `expected`, in that order. */
function inOrder(commands, expected) {
  let next = 0;
  for (const command of commands) {
    if (command === expected[next]) next++;
  }
  return next === expected.length;
}

/** First non-empty line of each run script, trimmed. */
function firstLines(text) {
  return runBodies(text).map(
    (body) =>
      body
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean) ?? "",
  );
}

/** Text between the heading that starts with `heading` and the next heading of that level. */
function section(markdown, heading) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## ${heading}`));
  if (start === -1) return "";
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) break;
    body.push(line);
  }
  return body.join("\n");
}

/** True when a Markdown heading (any level) starts with `name`. */
function hasHeading(markdown, name) {
  return markdown.split("\n").some((line) => {
    const match = /^#{1,6}\s+(.*?)\s*$/.exec(line);
    return match?.[1].startsWith(name) ?? false;
  });
}

/** Sorted, de-duplicated copy. */
function sorted(values) {
  return [...new Set(values)].sort();
}

/** Compares two lists as sets and describes the difference. Empty when equal. */
function compareSets(leftName, left, rightName, right) {
  const a = sorted(left);
  const b = sorted(right);
  const problems = [];
  const onlyLeft = a.filter((value) => !b.includes(value));
  const onlyRight = b.filter((value) => !a.includes(value));
  if (onlyLeft.length > 0) problems.push(`only in ${leftName}: ${onlyLeft.join(", ")}`);
  if (onlyRight.length > 0) problems.push(`only in ${rightName}: ${onlyRight.join(", ")}`);
  if (left.length !== a.length) problems.push(`${leftName} lists a value more than once`);
  if (right.length !== b.length) problems.push(`${rightName} lists a value more than once`);
  return problems;
}

const WORKFLOWS = ["ci", "pr-title", "codeql", "secrets", "audit"].map(
  (name) => `.github/workflows/${name}.yml`,
);

/** Every file under `dir` (relative paths), skipping generated and third-party folders. */
function walk(dir, skip) {
  const found = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
    if (skip.has(entry.name)) continue;
    if (entry.isDirectory()) {
      found.push(...walk(path, skip));
    } else if (entry.isFile()) {
      found.push(path);
    }
  }
  return found;
}

const SKIP_FOLDERS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
  ".planning",
  ".claude",
  ".gsd",
  "_",
  "generated",
]);

// ---------------------------------------------------------------------------
// The checks

const checks = [];

function check(name, run) {
  checks.push({ name, run });
}

// 1. Required files
check("Required files exist", () => {
  const required = [
    // root
    ".editorconfig",
    ".gitattributes",
    ".gitignore",
    ".nvmrc",
    "CODE_OF_CONDUCT.md",
    "COLLABORATION.md",
    "CONTRIBUTING.md",
    "FEATURES.md",
    "LICENSE",
    "NOTICE",
    "README.md",
    "SECURITY.md",
    "commitlint.config.mjs",
    "compose.yaml",
    "lint-staged.config.mjs",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    // hooks and scripts
    ".husky/commit-msg",
    ".husky/pre-commit",
    "scripts/scan-staged-secrets.sh",
    "scripts/test-commitlint.mjs",
    "scripts/test-secret-hook.mjs",
    "scripts/verify-foundation.mjs",
    // backend anchors
    "backend/README.md",
    "backend/.env.example",
    "backend/Dockerfile",
    "backend/openapi/openapi.json",
    "backend/package.json",
    "backend/pnpm-lock.yaml",
    "backend/pnpm-workspace.yaml",
    "backend/prisma/schema.prisma",
    "backend/src/env.ts",
    "backend/src/lib/app-error.ts",
    "backend/src/server.ts",
    // frontend anchors
    "frontend/README.md",
    "frontend/.env.example",
    "frontend/Dockerfile",
    "frontend/package.json",
    "frontend/pnpm-lock.yaml",
    "frontend/pnpm-workspace.yaml",
    "frontend/src/app/(app)/page.tsx",
    "frontend/src/env.ts",
    "frontend/src/lib/api/schema.d.ts",
    // mobile
    "mobile/README.md",
    "mobile/pubspec.yaml",
    "mobile/pubspec.lock",
    "mobile/analysis_options.yaml",
    "mobile/lib/main.dart",
    // documents
    "docs/decisions/0001-node-lts-pin.md",
    "docs/decisions/0002-root-tooling-package.md",
    "docs/decisions/0003-async-thunks-with-axios.md",
    "docs/decisions/0004-all-in-docker-development.md",
    "docs/decisions/0005-mobile-app-stack.md",
    "docs/standards/backend.md",
    "docs/standards/commits.md",
    "docs/standards/frontend.md",
    "docs/standards/github-settings.md",
    "docs/standards/mobile.md",
    "docs/standards/security.md",
    "docs/standards/structure.md",
    "docs/standards/testing.md",
    // GitHub
    ...WORKFLOWS,
    ".github/dependabot.yml",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/ISSUE_TEMPLATE/bug-report.yml",
    ".github/ISSUE_TEMPLATE/feature-request.yml",
    ".github/ISSUE_TEMPLATE/config.yml",
  ];
  return required.filter((file) => !existsSync(join(root, file))).map((file) => `missing: ${file}`);
});

// 2. Required headings
check("Required headings exist", () => {
  const headings = {
    "README.md": [
      "Quick start",
      "Repository layout",
      "Documentation",
      "Development",
      "Licence",
    ],
    "CONTRIBUTING.md": [
      "Getting started",
      "Setting up to commit",
      "Standards",
      "Commit messages",
      "Branches and pull requests",
      "Running checks",
      "Security",
      "Code of conduct",
      "Licence",
    ],
    "SECURITY.md": [
      "Supported versions",
      "Reporting a vulnerability",
      "What to include",
      "What happens next",
    ],
    "docs/standards/structure.md": [
      "Top-level layout",
      "Backend tree",
      "Frontend tree",
      "The mirror rule",
      "Naming",
      "Adding a feature",
      "Where configuration lives",
    ],
    "docs/standards/backend.md": [
      "Request path",
      "Module layout",
      "Import rules",
      "Validation",
      "Response envelope",
      "Error codes",
      "OpenAPI",
      "Logging and request ids",
      "Environment",
      "Prisma and the database",
    ],
    "docs/standards/frontend.md": [
      "Folders",
      "No RTK Query",
      "The slice recipe",
      "One axios instance",
      "Error handling in components",
      "Generating API types",
      "Styling",
      "Environment",
      "What enforces what",
    ],
    "docs/standards/commits.md": [
      "Format",
      "Allowed types",
      "Rules",
      "No AI attribution",
      "Accepted examples",
      "Rejected examples",
      "Branches and pull requests",
      "Local hooks",
    ],
    "docs/standards/testing.md": ["Commands", "Backend tests", "Frontend tests"],
    "docs/standards/security.md": [
      "Where each control lives",
      "Secret scanning",
      "Dependency rules",
      "Audit allow-list",
      "Dependabot and the pull request title check",
      "Workflow rules",
    ],
    "docs/standards/github-settings.md": [
      "Before the first push",
      "Repository settings",
      "Branch protection for main",
      "Required status checks",
      "After the first push",
      "If the repository is private",
    ],
  };
  for (const adr of readdirSync(join(root, "docs/decisions"))) {
    headings[`docs/decisions/${adr}`] = ["Status", "Context", "Decision", "Consequences"];
  }

  const problems = [];
  for (const [file, names] of Object.entries(headings)) {
    if (!existsSync(join(root, file))) {
      problems.push(`${file} does not exist`);
      continue;
    }
    const text = read(file);
    for (const name of names) {
      if (!hasHeading(text, name)) problems.push(`${file}: missing heading "${name}"`);
    }
  }
  return problems;
});

// 3. Node is written the same everywhere (D-04)
check("Node major is the same in every place it is written (D-04)", () => {
  const problems = [];
  const major = Number.parseInt(read(".nvmrc").trim().replace(/^v/, ""), 10);
  if (Number.isNaN(major)) return [".nvmrc does not start with a number"];

  for (const file of ["backend/Dockerfile", "frontend/Dockerfile"]) {
    const found = /^ARG NODE_VERSION=(\d+)\s*$/m.exec(read(file));
    if (found?.[1] !== String(major)) {
      problems.push(`${file}: NODE_VERSION default is ${found?.[1] ?? "missing"}, .nvmrc says ${major}`);
    }
  }

  const buildArgs = [...read("compose.yaml").matchAll(/^\s*NODE_VERSION:\s*"?(\d+)"?\s*$/gm)];
  if (buildArgs.length !== 2) {
    problems.push(`compose.yaml: expected 2 NODE_VERSION build args, found ${buildArgs.length}`);
  }
  for (const [, value] of buildArgs) {
    if (value !== String(major)) problems.push(`compose.yaml: NODE_VERSION is ${value}, .nvmrc says ${major}`);
  }

  const range = `>=${major} <${major + 1}`;
  for (const file of ["package.json", "backend/package.json", "frontend/package.json"]) {
    const engines = readJson(file).engines?.node;
    if (engines !== range) problems.push(`${file}: engines.node is "${engines}", expected "${range}"`);
  }
  return problems;
});

// 4. Exact dependency versions, one pnpm version (D-01)
check("Dependency versions are exact and packageManager is identical", () => {
  const problems = [];
  const exact = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
  const managers = new Map();
  for (const file of ["package.json", "backend/package.json", "frontend/package.json"]) {
    const manifest = readJson(file);
    managers.set(file, manifest.packageManager);
    for (const group of ["dependencies", "devDependencies", "optionalDependencies"]) {
      for (const [name, version] of Object.entries(manifest[group] ?? {})) {
        if (!exact.test(version)) problems.push(`${file}: ${group}.${name} is "${version}", not an exact version`);
      }
    }
  }
  // The mobile app: every hosted package in pubspec.yaml is an exact version too.
  for (const [name, version] of pubspecVersions(read("mobile/pubspec.yaml"))) {
    if (!exact.test(version)) problems.push(`mobile/pubspec.yaml: ${name} is "${version}", not an exact version`);
  }
  const distinct = new Set(managers.values());
  if (distinct.size !== 1 || ![...distinct][0]?.startsWith("pnpm@")) {
    problems.push(
      `packageManager differs or is not pnpm: ${[...managers].map(([f, v]) => `${f}=${v}`).join(", ")}`,
    );
  }
  return problems;
});

// 5. Every key of each app's env schema is in its .env.example (D-25)
check("Every Zod env key is in the app's .env.example (D-25)", () => {
  const problems = [];
  for (const app of ["backend", "frontend"]) {
    const source = read(`${app}/src/env.ts`);
    const body = /const envSchema = z\.object\(\{([\s\S]*?)\n\}\);/.exec(source)?.[1];
    if (body === undefined) {
      problems.push(`${app}/src/env.ts: could not find "const envSchema = z.object({ ... });"`);
      continue;
    }
    const schemaKeys = [...body.matchAll(/^ {2}([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1]);
    if (schemaKeys.length === 0) problems.push(`${app}/src/env.ts: found no keys in the env schema`);
    const exampleKeys = [...read(`${app}/.env.example`).matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(
      (match) => match[1],
    );
    for (const key of schemaKeys) {
      if (!exampleKeys.includes(key)) problems.push(`${app}/.env.example is missing ${key}`);
    }
  }
  return problems;
});

// 6. The documented commit types equal the commitlint list (D-14)
check("Documented commit types equal TYPES in commitlint.config.mjs (D-14)", () => {
  const problems = [];
  const table = section(read("docs/standards/commits.md"), "Allowed types");
  const documented = [...table.matchAll(/^\|\s*`([a-z]+)`\s*\|/gm)].map((match) => match[1]);
  problems.push(...compareSets("docs/standards/commits.md", documented, "commitlint.config.mjs", TYPES));

  const contributing = read("CONTRIBUTING.md");
  for (const type of TYPES) {
    if (!contributing.includes(`\`${type}\``)) problems.push(`CONTRIBUTING.md does not mention \`${type}\``);
  }
  return problems;
});

// 7. The documented error codes equal ERROR_CODES (D-12)
check("Documented error codes equal ERROR_CODES in app-error.ts (D-12)", () => {
  const source = read("backend/src/lib/app-error.ts");
  const list = /ERROR_CODES\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(source)?.[1];
  if (list === undefined) return ["backend/src/lib/app-error.ts: could not find ERROR_CODES"];
  const codes = [...list.matchAll(/"([A-Z_]+)"/g)].map((match) => match[1]);
  const table = section(read("docs/standards/backend.md"), "Error codes");
  const documented = [...table.matchAll(/^\|\s*`([A-Z_]+)`\s*\|\s*\d{3}\s*\|/gm)].map((match) => match[1]);
  return compareSets("docs/standards/backend.md", documented, "backend/src/lib/app-error.ts", codes);
});

// 8. ci.yml: both apps, every push and pull request, no filters (CI-01)
check("ci.yml runs both apps on every push and pull request (CI-01)", () => {
  const problems = [];
  const text = stripComments(read(".github/workflows/ci.yml"));
  const triggers = triggersOf(text);
  for (const trigger of ["push", "pull_request"]) {
    if (!triggers.includes(trigger)) problems.push(`ci.yml has no ${trigger} trigger`);
  }
  if (/^\s*(?:paths|paths-ignore|branches|branches-ignore|tags)\s*:/m.test(topLevelBlock(text, "on"))) {
    problems.push("ci.yml has a path, branch or tag filter under on:");
  }
  if (/^\s*matrix\s*:/m.test(text)) problems.push("ci.yml has a matrix (D-04: one Node version only)");
  if (!/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(text)) {
    problems.push("ci.yml: top-level permissions must be contents: read");
  }
  if (!/^concurrency:/m.test(text) || !/cancel-in-progress:\s*true/.test(text)) {
    problems.push("ci.yml: needs a concurrency group with cancel-in-progress: true");
  }

  const jobs = jobsOf(text);
  const steps = [
    "pnpm install --frozen-lockfile",
    "pnpm lint",
    "pnpm format:check",
    "pnpm typecheck",
    "pnpm test",
    "pnpm build",
  ];
  const drift = { frontend: "pnpm api:types", backend: "pnpm openapi:generate" };
  for (const app of ["frontend", "backend"]) {
    const job = jobs.get(app);
    if (job === undefined) {
      problems.push(`ci.yml has no job "${app}"`);
      continue;
    }
    if (!job.includes("node-version-file: .nvmrc")) problems.push(`ci.yml ${app}: needs node-version-file: .nvmrc`);
    if (!new RegExp(`working-directory:\\s*${app}\\s*$`, "m").test(job)) {
      problems.push(`ci.yml ${app}: steps must run in the ${app} folder`);
    }
    const commands = firstLines(job);
    if (!inOrder(commands, steps)) {
      problems.push(`ci.yml ${app}: run steps must include, in order: ${steps.join(", ")}`);
    }
    const driftStep = runBodies(job).find((body) => body.includes(drift[app]));
    if (driftStep === undefined || !driftStep.includes("git diff --exit-code")) {
      problems.push(`ci.yml ${app}: needs a drift step (${drift[app]} then git diff --exit-code)`);
    }
  }
  if (!jobs.get("backend")?.includes("postgres:18-alpine")) {
    problems.push("ci.yml backend: needs the postgres:18-alpine service container");
  }

  // The mobile app: the same Flutter as mobile/pubspec.yaml, then format, analyze and test.
  const mobile = jobs.get("mobile");
  if (mobile === undefined) {
    problems.push('ci.yml has no job "mobile"');
  } else {
    const pinned = /^\s*flutter:\s*"?(\d+\.\d+\.\d+)"?\s*$/m.exec(
      topLevelBlock(stripComments(read("mobile/pubspec.yaml")), "environment"),
    )?.[1];
    const used = /FLUTTER_VERSION:\s*"?(\d+\.\d+\.\d+)"?/.exec(mobile)?.[1];
    if (pinned === undefined) problems.push("mobile/pubspec.yaml: environment.flutter must be an exact version");
    if (used === undefined || used !== pinned) {
      problems.push(`ci.yml mobile: FLUTTER_VERSION (${used}) must equal environment.flutter in mobile/pubspec.yaml (${pinned})`);
    }
    if (!/working-directory:\s*mobile\s*$/m.test(mobile)) problems.push("ci.yml mobile: steps must run in the mobile folder");
    const mobileSteps = [
      "flutter pub get --enforce-lockfile",
      "dart format --output=none --set-exit-if-changed .",
      "flutter analyze --fatal-infos",
      "flutter test",
    ];
    if (!inOrder(firstLines(mobile), mobileSteps)) {
      problems.push(`ci.yml mobile: run steps must include, in order: ${mobileSteps.join(", ")}`);
    }
  }
  return problems;
});

// 9. pr-title.yml and workflow hygiene (CI-02, D-16)
check("pr-title.yml passes the title through env; no script holds an expression", () => {
  const problems = [];
  const text = stripComments(read(".github/workflows/pr-title.yml"));
  if (!jobsOf(text).has("pr-title")) problems.push('pr-title.yml has no job "pr-title"');
  if (!/types:\s*\[[^\]]*\bedited\b[^\]]*\]/.test(text)) problems.push("pr-title.yml: trigger types must include edited");
  if (!/^\s*PR_TITLE:\s*\$\{\{\s*github\.event\.pull_request\.title\s*\}\}\s*$/m.test(text)) {
    problems.push("pr-title.yml: PR_TITLE must be set from the pull request title under env");
  }
  if (!text.includes("dependabot[bot]")) problems.push("pr-title.yml: must skip Dependabot pull requests");
  if (!/commitlint/.test(text)) problems.push("pr-title.yml: must run commitlint");

  for (const file of WORKFLOWS) {
    const workflow = stripComments(read(file));
    // The title may appear only as the value of the PR_TITLE variable.
    workflow.split("\n").forEach((line, index) => {
      if (/pull_request\.title/.test(line) && !/^\s*PR_TITLE:\s*\$\{\{/.test(line)) {
        problems.push(`${file}:${index + 1}: the pull request title is used outside the PR_TITLE variable`);
      }
    });
    for (const body of runBodies(workflow)) {
      if (body.includes("${{")) {
        problems.push(`${file}: a run script contains a \${{ }} expression: ${body.trim().split("\n")[0]}`);
      }
    }
    if (!/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(workflow)) {
      problems.push(`${file}: top-level permissions must be contents: read`);
    }
  }
  return problems;
});

// 10. Security workflows: CodeQL, audit, and nothing advisory (SEC-02, D-24)
check("CodeQL and audit workflows are complete and no security check is advisory", () => {
  const problems = [];

  const codeql = stripComments(read(".github/workflows/codeql.yml"));
  for (const trigger of ["push", "pull_request", "schedule"]) {
    if (!triggersOf(codeql).includes(trigger)) problems.push(`codeql.yml has no ${trigger} trigger`);
  }
  if (!jobsOf(codeql).has("analyze")) problems.push('codeql.yml has no job "analyze"');
  if (!codeql.includes("javascript-typescript")) problems.push("codeql.yml: language javascript-typescript missing");
  if (!/build-mode:\s*none/.test(codeql)) problems.push("codeql.yml: build-mode must be none");

  const audit = stripComments(read(".github/workflows/audit.yml"));
  if (!triggersOf(audit).includes("schedule")) problems.push("audit.yml has no schedule trigger");
  const jobs = jobsOf(audit);
  if (!jobs.has("audit")) problems.push('audit.yml has no job "audit"');
  if (!jobs.has("dependency-review")) problems.push('audit.yml has no job "dependency-review"');
  const thresholds = audit.match(/--audit-level=high/g)?.length ?? 0;
  if (thresholds < 2) problems.push(`audit.yml: --audit-level=high must run for both apps (found ${thresholds})`);
  if (!/fail-on-severity:\s*high/.test(audit)) problems.push("audit.yml: dependency review needs fail-on-severity: high");

  for (const file of WORKFLOWS) {
    if (/^\s*(?:- )?continue-on-error\s*:/m.test(stripComments(read(file)))) {
      problems.push(`${file}: continue-on-error makes a check advisory`);
    }
  }
  return problems;
});

// 11. The CI secret scan uses the same gitleaks as the hook (D-23)
check("secrets.yml scans the full history with the hook's gitleaks version (D-23)", () => {
  const problems = [];
  const workflow = stripComments(read(".github/workflows/secrets.yml"));
  const inCi = /gitleaks:v(\d+\.\d+\.\d+)/.exec(workflow)?.[1];
  const inHook = /gitleaks:v(\d+\.\d+\.\d+)/.exec(read("scripts/scan-staged-secrets.sh"))?.[1];
  if (inCi === undefined) problems.push("secrets.yml: no pinned gitleaks image tag");
  if (inHook === undefined) problems.push("scripts/scan-staged-secrets.sh: no pinned gitleaks image tag");
  if (inCi !== inHook) problems.push(`gitleaks version differs: secrets.yml ${inCi}, hook ${inHook}`);
  const job = jobsOf(workflow).get("gitleaks");
  if (job === undefined) problems.push('secrets.yml has no job "gitleaks"');
  else if (!/fetch-depth:\s*0/.test(job)) problems.push("secrets.yml: checkout must use fetch-depth: 0");
  if (/gitleaks\/gitleaks-action/.test(workflow)) problems.push("secrets.yml uses gitleaks-action (needs a licence)");
  // The scan must refuse to pass when gitleaks scanned nothing.
  if (!/commits scanned/.test(workflow)) problems.push("secrets.yml: must compare gitleaks' scanned-commit count");
  return problems;
});

// 12. Dependabot (SEC-01, D-22)
check("dependabot.yml covers every ecosystem with the routine group and chore prefix (D-22)", () => {
  const problems = [];
  const text = stripComments(read(".github/dependabot.yml"));
  if (!/^version:\s*2\s*$/m.test(text)) problems.push("dependabot.yml: version must be 2");

  const entries = topLevelBlock(text, "updates")
    .split(/^ {2}- (?=package-ecosystem:)/m)
    .slice(1)
    .map((entry) => ({
      ecosystem: /package-ecosystem:\s*"?([\w-]+)"?/.exec(entry)?.[1],
      directory: /directory:\s*"?([^"\s]+)"?/.exec(entry)?.[1],
      text: entry,
    }));

  const wanted = [
    ["npm", "/"],
    ["npm", "/frontend"],
    ["npm", "/backend"],
    ["github-actions", "/"],
    ["docker", "/frontend"],
    ["docker", "/backend"],
    ["docker-compose", "/"],
    ["pub", "/mobile"],
  ];
  for (const [ecosystem, directory] of wanted) {
    if (!entries.some((entry) => entry.ecosystem === ecosystem && entry.directory === directory)) {
      problems.push(`dependabot.yml: no ${ecosystem} entry for ${directory}`);
    }
  }
  for (const entry of entries) {
    const label = `${entry.ecosystem} ${entry.directory}`;
    if (!/prefix:\s*"?chore"?\s*$/m.test(entry.text)) problems.push(`dependabot.yml ${label}: commit-message prefix must be chore`);
    if (!/interval:\s*"?weekly"?/.test(entry.text)) problems.push(`dependabot.yml ${label}: interval must be weekly`);
    if (entry.ecosystem === "npm") {
      const group = /^ {6}routine:\s*$([\s\S]*?)(?=^ {4}\S|(?![\s\S]))/m.exec(entry.text)?.[1];
      if (group === undefined) {
        problems.push(`dependabot.yml ${label}: needs a group named routine`);
      } else {
        if (!/applies-to:\s*version-updates/.test(group)) problems.push(`dependabot.yml ${label}: routine must apply to version-updates`);
        const types = /update-types:\s*\[([^\]]*)\]/.exec(group)?.[1] ?? "";
        if (!/minor/.test(types) || !/patch/.test(types) || /major/.test(types)) {
          problems.push(`dependabot.yml ${label}: routine must include minor and patch updates only`);
        }
      }
    }
  }
  return problems;
});

// 13. Relative links resolve
check("Every relative link in README, CONTRIBUTING, SECURITY and docs resolves", () => {
  const problems = [];
  const files = [
    "README.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "mobile/README.md",
    ...walk("docs", SKIP_FOLDERS).filter((file) => file.endsWith(".md")),
  ];
  for (const file of files) {
    if (!existsSync(join(root, file))) {
      problems.push(`${file} does not exist`);
      continue;
    }
    // Links inside code fences and code spans are examples, not links.
    const text = read(file).replace(/^```[\s\S]*?^```/gm, "").replace(/`[^`\n]*`/g, "");
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) continue;
      const path = decodeURIComponent(target.split("#")[0].split("?")[0]);
      const resolved = path.startsWith("/") ? join(root, path) : resolve(root, dirname(file), path);
      if (!existsSync(resolved)) problems.push(`${file}: broken link to ${target}`);
    }
  }
  return problems;
});

// 14. Repository hygiene
check("mobile/ tracks no build output or signing key, no .env is tracked, no email in public policy files", () => {
  const problems = [];
  let tracked;
  try {
    tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch (error) {
    return [`could not run git ls-files: ${error.message}`];
  }

  // The Flutter app: source and the two platform folders, never what a build writes and
  // never a signing key.
  const notTracked = /^mobile\/(?:build\/|\.dart_tool\/|android\/\.gradle\/|android\/local\.properties$|android\/key\.properties$|ios\/Pods\/)|\.(?:jks|keystore)$/;
  for (const file of tracked) {
    if (notTracked.test(file)) problems.push(`build output or a signing key is tracked: ${file}`);
  }
  for (const file of tracked) {
    if (/(?:^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith(".env.example")) {
      problems.push(`an environment file is tracked: ${file}`);
    }
  }

  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
  for (const file of ["SECURITY.md", "CODE_OF_CONDUCT.md", ".github/ISSUE_TEMPLATE/config.yml"]) {
    const found = email.exec(read(file));
    if (found) problems.push(`${file}: contains an email address (${found[0]})`);
  }
  return problems;
});

// ---------------------------------------------------------------------------
// Run

let failed = 0;
checks.forEach(({ name, run }, index) => {
  const number = String(index + 1).padStart(2, "0");
  let problems;
  try {
    problems = run();
  } catch (error) {
    problems = [`check could not run: ${error.message}`];
  }
  if (problems.length === 0) {
    console.log(`PASS  ${number}  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${number}  ${name}`);
    for (const problem of problems) console.log(`          - ${problem}`);
  }
});

// Owner-input placeholders are reminders, not failures.
const placeholder = /\[OWNER TO SET: [^\]]+\]/g;
const thisFile = relative(root, fileURLToPath(import.meta.url)).replaceAll("\\", "/");
for (const file of walk("", SKIP_FOLDERS)) {
  if (file === thisFile || !/\.(?:md|ya?ml|json|mjs|ts|tsx|sh)$/.test(file)) continue;
  if (statSync(join(root, file)).size > 1_000_000) continue;
  const tokens = new Set(read(file).match(placeholder) ?? []);
  for (const token of tokens) console.log(`WARN  ${file}: ${token}`);
}

console.log(`\n${checks.length - failed} of ${checks.length} checks passed.`);
if (failed > 0) {
  process.exit(1);
}
