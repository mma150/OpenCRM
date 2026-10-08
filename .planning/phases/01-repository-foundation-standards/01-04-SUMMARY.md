---
phase: 01-repository-foundation-standards
plan: 04
subsystem: infra
tags: [eslint, prettier, typescript, tsup, vitest, supertest, postgres, test-database]

requires:
  - phase: 01-repository-foundation-standards
    provides: backend skeleton (createApp, parseEnv, health path) from plan 01-02
provides:
  - "pnpm --dir backend check: ESLint (strictTypeChecked, zero warnings), Prettier check and strict tsc in one command"
  - "Machine-enforced D-09 layering and a process.env restriction through ESLint"
  - "pnpm --dir backend build producing dist/server.js"
  - "Vitest harness on a real, auto-provisioned PostgreSQL database named opencrm_test"
  - "First tests: parseEnv failures name the variable; health envelope and CORS through supertest"
affects: [01-05, 01-06, 01-07, 01-08, 01-09, 01-10, phase-02]

actuals:
  tokens: 3300
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Flat ESLint 10 config: js recommended + typescript-eslint strictTypeChecked + simple-import-sort + unicorn kebab-case + eslint-config-prettier last"
    - "Layering by no-restricted-imports per file glob: *.controller.ts cannot import lib/prisma or generated/prisma, *.routes.ts cannot import *.service"
    - "process.env restricted by no-restricted-properties; allowed only in src/env.ts, prisma.config.ts, test/global-setup.ts"
    - "Test database: Vitest globalSetup creates opencrm_test if absent (pg against the postgres maintenance DB) and runs prisma migrate deploy; vitest test.env forces DATABASE_URL to it"
    - "Typed supertest bodies via a declared envelope interface and a cast, no lint rules disabled in tests"

key-files:
  created:
    - backend/tsconfig.json
    - backend/eslint.config.mjs
    - backend/prettier.config.mjs
    - backend/.prettierignore
    - backend/tsup.config.ts
    - backend/vitest.config.ts
    - backend/test/global-setup.ts
    - backend/src/env.test.ts
    - backend/src/modules/health/health.test.ts
  modified:
    - backend/src/server.ts
    - backend/src/modules/health/health.service.ts

key-decisions:
  - "noUncheckedIndexedAccess is on; the health query row is guarded explicitly (throws if the query returns no rows) instead of a non-null assertion"
  - "global-setup resolves DATABASE_URL from the process, else backend/.env, else backend/.env.example (read in that order because process.loadEnvFile never overrides a variable already set)"
  - "test/global-setup.ts is a third place allowed to read process.env, alongside src/env.ts and prisma.config.ts; vitest.config.ts stays free of it by importing resolveDatabaseUrl"
  - "@typescript-eslint/no-unused-vars ignores arguments starting with an underscore, because Express error middleware must declare four arguments"
  - "allowImportingTsExtensions is on (noEmit project) so vitest.config.ts can import ./test/global-setup.ts with its extension and avoid Vite's native-config-loader warning"

patterns-established:
  - "Run backend gates from the repo root with pnpm --dir backend <script>; on this machine via npx pnpm@11.28.5"
  - "Host test runs against a non-default database port export DATABASE_URL in the shell; no .env file is created and .env.example is unchanged"

requirements-completed: [FND-03, FND-06, FND-08]

coverage:
  - id: D1
    description: "One command (pnpm --dir backend check) runs ESLint with zero warnings allowed, Prettier check and strict tsc, and exits 0 on the committed tree"
    requirement: FND-03
    verification:
      - kind: command
        ref: "npx pnpm@11.28.5 --dir backend check -> exit 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "check fails closed: a Bad-Name.ts with `any` and unsorted imports is reported by filename-case, simple-import-sort and no-explicit-any"
    requirement: FND-03
    verification:
      - kind: command
        ref: "temporary backend/src/Bad-Name.ts, check -> exit 1 with the three rule names; file deleted, never committed"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-09 layering and the process.env restriction are lint errors (controller importing lib/prisma, routes importing a service, process.env in app.ts)"
    requirement: FND-03
    verification:
      - kind: command
        ref: "three temporary edits, pnpm --dir backend lint -> exit 1, no-restricted-imports x2 and no-restricted-properties; edits reverted (git status clean for those files)"
        status: pass
    human_judgment: false
  - id: D4
    description: "pnpm --dir backend build produces dist/server.js and dist is gitignored"
    requirement: FND-06
    verification:
      - kind: command
        ref: "pnpm --dir backend build; test -f backend/dist/server.js; git status does not list dist"
        status: pass
    human_judgment: false
  - id: D5
    description: "pnpm --dir backend test passes (8 tests, 2 files) against opencrm_test, from scratch and on a repeat run"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "backend/src/env.test.ts, backend/src/modules/health/health.test.ts; run after dropping opencrm_test and again immediately after"
        status: pass
    human_judgment: false
  - id: D6
    description: "A missing DATABASE_URL, a non-numeric PORT and an unknown NODE_ENV are each reported by variable name"
    requirement: FND-08
    verification:
      - kind: unit
        ref: "backend/src/env.test.ts#parseEnv"
        status: pass
    human_judgment: false
  - id: D7
    description: "GET /api/v1/health still returns the same envelope after the compliance edits; CORS allows the configured origin and sends no header to another"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "curl against the running Compose api (200, {data:{status:ok,database:{connected,serverTime}},meta:{}}); health.test.ts CORS cases"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-10-08
status: complete
---

# Phase 1 Plan 04: Backend Check, Build and Test Harness Summary

**One command (`pnpm --dir backend check`) runs strictTypeChecked ESLint with zero warnings, a Prettier check and `tsc` with `noUncheckedIndexedAccess`, fails on naming, `any`, import order and layering violations, and a Vitest + supertest harness provisions its own `opencrm_test` PostgreSQL database and proves the env errors and the health envelope.**

## Performance

- **Duration:** about 11 min (host `pnpm install --frozen-lockfile` took 58 s)
- **Completed:** 2026-10-08T11:10Z
- **Tasks:** 2
- **Files:** 9 created, 2 modified

## Accomplishments

- `npx pnpm@11.28.5 --dir backend check` exits 0 on the committed tree; `build` writes `backend/dist/server.js` (4.95 KB, ignored by git); `test` runs 8 tests in 2 files green.
- Test database is provisioned by the run itself. I dropped `opencrm_test`, ran the tests, and `psql -lqt` listed `opencrm` and `opencrm_test` again; the second run passed too. With `DATABASE_URL` unset the setup falls back to `backend/.env.example` (it then tried `localhost:5432`, which is not published on this machine, and failed with `ECONNREFUSED ::1:5432`, which shows the fallback was read).
- Prisma reported `Datasource "db": PostgreSQL database "opencrm_test" ... at "localhost:5440"` during migrate, confirming the development database `opencrm` is not used (T-04-01).
- `pnpm --dir backend audit --audit-level=high` exits 0 and reports 1 vulnerability, severity low.

## Negative proofs (exact output)

Temporary `backend/src/Bad-Name.ts` (an `any` annotation, `zod` imported before `express`), then `pnpm --dir backend check`:

```
backend\src\Bad-Name.ts
  1:1   error  Filename is not in kebab case. Rename it to `bad-name.ts`  unicorn/filename-case
  1:1   error  Run autofix to sort these imports!                         simple-import-sort/imports
  4:21  error  Unexpected any. Specify a different type                   @typescript-eslint/no-explicit-any
3 problems (3 errors, 0 warnings)
[ELIFECYCLE] Command failed with exit code 1.   (EXIT=1)
```

The file was deleted afterwards and never staged. Three temporary edits (a `lib/prisma` import in `health.controller.ts`, a `./health.service` import in `health.routes.ts`, `process.env.PORT` in `app.ts`), then `pnpm --dir backend lint`:

```
src\app.ts:8:24  error  'process.env' is restricted from being used. Read configuration through `env` from src/env.ts instead of process.env  no-restricted-properties
src\modules\health\health.controller.ts:3:1  error  '../../lib/prisma' import is restricted from being used by a pattern. Controllers must not touch Prisma. Call a service instead (D-09)  no-restricted-imports
src\modules\health\health.routes.ts:4:1  error  './health.service' import is restricted from being used by a pattern. Routes must not import services. Go through the controller (D-09)  no-restricted-imports
3 problems (3 errors, 0 warnings)   (EXIT=1)
```

All three edits were reverted; `app.ts`, `health.controller.ts` and `health.routes.ts` do not differ from the base commit, and `check` exits 0 again.

TDD red step for Task 2: with the tests written but no `vitest.config.ts`, both files failed with `process.exit unexpectedly called with "1"` raised from `src/env.ts` (no test environment, no database URL). After the config and global setup existed they went green. `parseEnv` and `env.ts` needed no change.

## Source changes made for compliance

- `backend/src/server.ts`: simple-import-sort moved `import { createApp }` above `import { env }`. Behaviour is unchanged because `app.ts` and `lib/prisma.ts` import `./env` themselves, so `env.ts` still validates on first import and exits before `listen`. The comment on that line was reworded because "must stay first" is no longer literally true.
- `backend/src/modules/health/health.service.ts`: `rows[0].now` replaced by `const row = rows[0]; if (!row) throw new Error("Health query returned no rows")` (needed by `noUncheckedIndexedAccess`).
- Auto-fix and Prettier changed nothing else. `error-handler.ts` needed no edit; the `_next` complaint was solved in the ESLint config (see decisions). `env.ts`, `app.ts`, `prisma.ts`, `health.controller.ts` and `health.routes.ts` are unchanged.

## Task Commits

1. **Task 1: Backend check command and build** - `3fd125e` (chore)
2. **Task 2: Backend test harness with env and health tests** - `5590e68` (test)

**Plan metadata:** the docs(01-04) commit that follows.

## Decisions Made

See `key-decisions` above. Two worth stating plainly: the plan said the setup loads `.env.example` and then `.env`; `process.loadEnvFile` does not override existing variables, so the order is reversed (`.env` first) to make `.env` win. And `process.env` is readable in `test/global-setup.ts` as a third exception to the "only env.ts and prisma.config.ts" rule, because the global setup runs before any test and cannot go through `src/env.ts` (which would exit the process on a bad URL).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `_next` flagged by no-unused-vars**
- **Found during:** Task 1 (first lint run)
- **Issue:** `strictTypeChecked` rejected the unused `_next` parameter that Express requires on error middleware.
- **Fix:** `@typescript-eslint/no-unused-vars` configured with `argsIgnorePattern: "^_"` in `eslint.config.mjs` rather than editing the handler or adding a disable comment.
- **Files modified:** `backend/eslint.config.mjs`
- **Commit:** `3fd125e`

**2. [Rule 3 - Blocking] `.env` / `.env.example` load order**
- **Found during:** Task 2 design
- **Issue:** Plan order (`.env.example` then `.env`) would make `.env` ineffective because `loadEnvFile` never overrides.
- **Fix:** Read `.env` first, then `.env.example`.
- **Files modified:** `backend/test/global-setup.ts`
- **Commit:** `5590e68`

**3. [Rule 3 - Blocking] Vite native config loader warning**
- **Found during:** Task 2 (first test run)
- **Issue:** Extensionless `./test/global-setup` import in `vitest.config.ts` printed a Vite warning about `configLoader: 'native'`.
- **Fix:** Import with the `.ts` extension and set `allowImportingTsExtensions` in `tsconfig.json`.
- **Files modified:** `backend/vitest.config.ts`, `backend/tsconfig.json`
- **Commit:** `5590e68`

**Total deviations:** 3 auto-fixed (all Rule 3), 0 architectural. No dependency, manifest or lockfile change (`git status` was clean after the frozen install).

## Issues Encountered

- Host Node 25.6.0 prints `Unsupported engine` on every pnpm call; expected, `engines` untouched.
- Host `pnpm` is 10.3.0, so every command in this plan was run as `npx pnpm@11.28.5`. The nested `pnpm run lint && ...` inside the `check` script resolved fine under that run.
- Tests from the host reach PostgreSQL on port 5440 (`API_PORT=4010 DB_PORT=5440 WEB_PORT=3010` for Compose); I exported `DATABASE_URL=postgresql://opencrm:opencrm@localhost:5440/opencrm` in the shell. No `.env` was created and `.env.example` is unchanged. Contributors on default ports need nothing.
- Prettier checks `package.json`, `pnpm-workspace.yaml`, `tsconfig.json` and the configs and all passed; Dockerfile, shell and `.prisma`/`.env.example` files are outside its parsers.

## Threat Surface

T-04-01 holds (`vitest.config.ts` sets `DATABASE_URL` from `getTestDatabaseUrl`; Prisma log names `opencrm_test`). T-04-02 and T-04-03 are proven by the negative runs above. T-04-04 accepted as planned: `CREATE DATABASE` interpolates the constant `opencrm_test` only. T-01-SC: install used `--frozen-lockfile`, no package added. No new threat flags.

## Known Stubs

None.

## User Setup Required

None. To run the tests on the host: `docker compose up -d --wait db`, then `pnpm --dir backend test` (set `DATABASE_URL` in the shell or `backend/.env` if the database is published on a non-default port).

## Next Phase Readiness

- Plan 01-05 can write its tests with `vitest` + `supertest` using the same pattern (typed body cast, `createApp()`, `prisma.$disconnect()` in `afterAll`), and CI (plan 01-10) can call `check`, `test`, `build` and `audit` as defined.
- Test files must be named `*.test.ts` under `src/`; `fileParallelism` is off because all files share `opencrm_test`.
- Stack stopped with `docker compose down` (no `-v`); volumes `opencrm_db-data` (now also holding `opencrm_test`) and `opencrm_api-node-modules` remain. `backend/node_modules` and `backend/dist` exist in the worktree but are gitignored.

---
*Phase: 01-repository-foundation-standards*
*Completed: 2026-10-08*

## Self-Check: PASSED

All nine created files and two modified files exist, commits `3fd125e` and `5590e68` are in `git log`, and `check`, `test` (twice, plus from a dropped database), `build`, the negative proofs and the live health request were run against the final committed state.
