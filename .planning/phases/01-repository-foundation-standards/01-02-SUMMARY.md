---
phase: 01-repository-foundation-standards
plan: 02
subsystem: infra
tags: [docker-compose, postgres, express, prisma, pg-adapter, zod, tsx, health-endpoint]

requires:
  - phase: 01-repository-foundation-standards
    provides: owner-approved backend manifest and lockfile (plan 01-01)
provides:
  - compose.yaml with db (postgres:18-alpine) and api services, healthchecks, hot reload
  - GET /api/v1/health travelling routes -> controller -> service -> Prisma -> PostgreSQL
  - Zod-validated environment (parseEnv, env) that fails fast naming the variable
  - Response envelope { data, meta } and error envelope { error: { code, message, details } }
  - Prisma 7 config and schema (no models) applied with prisma migrate deploy
affects: [01-03, 01-04, 01-05, 01-06, 01-07, 01-08, 01-09, 01-10, phase-02]

actuals:
  tokens: 2800
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Module layout per D-09: <name>.routes.ts -> <name>.controller.ts -> <name>.service.ts, only the service touches Prisma"
    - "Success envelope { data, meta: {} }; error envelope { error: { code, message, details } } with no stack trace in the body"
    - "env.ts is the only reader of process.env (prisma.config.ts excepted); imported first in server.ts so invalid config exits before listen"
    - "Dev container entrypoint: pnpm install --frozen-lockfile, prisma generate, prisma migrate deploy, exec pnpm dev"

key-files:
  created:
    - compose.yaml
    - backend/Dockerfile
    - backend/docker/dev-entrypoint.sh
    - backend/.env.example
    - backend/prisma.config.ts
    - backend/prisma/schema.prisma
    - backend/src/env.ts
    - backend/src/lib/prisma.ts
    - backend/src/middleware/error-handler.ts
    - backend/src/modules/health/health.service.ts
    - backend/src/modules/health/health.controller.ts
    - backend/src/modules/health/health.routes.ts
    - backend/src/app.ts
    - backend/src/server.ts
  modified: []

key-decisions:
  - "Compose healthcheck uses a node -e fetch one-liner; confirmed node:24-slim has neither curl nor wget, and the check reports healthy"
  - "CHECKPOINT_DISABLE=1 kept: the string is referenced in the Prisma 7.10 CLI bundle (cli.js, studio.js), so it is a recognised switch (that no network call is made was not packet-tested)"
  - "pnpm store is relocated into the api-node-modules volume with pnpm_config_store_dir (the npm_config_ spelling is ignored by pnpm 11)"
  - "OpenSSL is installed in the dev image so Prisma stops warning that it cannot detect libssl"
  - "Error codes INTERNAL_ERROR (this plan) and SERVICE_UNAVAILABLE (plan 01-05) remain proposals (research A4) and are costly to rename once Phase 2 clients switch on them"

patterns-established:
  - "Verification ports on this machine: API_PORT=4010, DB_PORT=5440 (defaults 4000/5432 were left unchanged)"
  - "Generated Prisma client lives at backend/src/generated/prisma (gitignored) and is recreated by every container start"

requirements-completed: [FND-01, FND-04, FND-06, FND-08]

coverage:
  - id: D1
    description: "docker compose up -d --wait db api starts PostgreSQL and the API and both report healthy"
    requirement: FND-04
    verification:
      - kind: integration
        ref: "docker compose up -d --wait db api; docker compose ps --format '{{.Service}} {{.Health}}' -> api healthy, db healthy"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/v1/health returns 200 with { data: { status: ok, database: { connected, serverTime } }, meta } where serverTime comes from SELECT now() through Prisma"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "plan Task 1 automated curl | node check against http://localhost:4010/api/v1/health"
        status: pass
    human_judgment: false
  - id: D3
    description: "Invalid DATABASE_URL (malformed, empty or unset) and invalid PORT print the variable name and exit 1 before the port is bound"
    requirement: FND-08
    verification:
      - kind: integration
        ref: "docker compose exec -T -e DATABASE_URL=not-a-url api pnpm exec tsx src/server.ts -> 'DATABASE_URL: Invalid URL', exit 1"
        status: pass
    human_judgment: false
  - id: D4
    description: "Prisma schema validated, client generated and migrate deploy applied to the Compose database (exit 0)"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "Task 2 automated command chain (prisma validate, generate, migrate deploy, test -d src/generated/prisma)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Host edit to a backend source file restarts tsx inside the container without a rebuild"
    requirement: FND-04
    verification:
      - kind: integration
        ref: "appended blank line to health.service.ts; docker compose logs api shows '[tsx] change in ./src/modules/health/health.service.ts Restarting...' after about 1 s; edit reverted"
        status: pass
    human_judgment: false
  - id: D6
    description: "Error handler returns the generic 500 envelope and never a stack trace; CORS allows only the configured origin"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "db stopped -> 500 {error:{code:INTERNAL_ERROR,message:Internal server error,details:null}}; Origin http://localhost:3000 allowed, http://evil.example gets no allow-origin header"
        status: pass
    human_judgment: false
  - id: D7
    description: "Development-only credentials are labelled as such and PostgreSQL is published on 127.0.0.1 only"
    requirement: FND-04
    verification:
      - kind: other
        ref: "docker compose port db 5432 -> 127.0.0.1:5440; comments in compose.yaml and backend/.env.example"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-08
status: complete
---

# Phase 1 Plan 02: Walking-Skeleton Tracer (API health) Summary

**One request travels Compose -> Express 5 route -> controller -> service -> Prisma 7 (pg adapter) -> PostgreSQL 18 and returns the `{ data, meta }` envelope, with Zod fail-fast environment validation, hot reload through the Windows bind mount, and the empty Prisma schema applied with `migrate deploy`.**

## Performance

- **Duration:** about 15 min in this run (an earlier run wrote the Task 1 files but was interrupted before running anything)
- **Completed:** 2026-10-08T10:37:33Z
- **Tasks:** 2 (Task 1 tracer, Task 2 blocking schema apply)
- **Files modified:** 14 created, 0 modified

## Accomplishments

- `docker compose up -d --wait db api` brings up `postgres:18-alpine` and the API; both report healthy. First start from empty volumes: 84 s and 113 s in two runs (dominated by the 471-package `pnpm install`, about 85 s); warm restart: 15 s.
- `GET /api/v1/health` returns `{"data":{"status":"ok","database":{"connected":true,"serverTime":"2026-10-08T10:36:35.918Z"}},"meta":{}}` with `serverTime` read from PostgreSQL via `prisma.$queryRaw`.
- Layering holds: the controller does not import Prisma, the routes file does not import the service, the service references neither Request nor Response.
- Environment fails fast before the port is bound. Output examples: `DATABASE_URL: Invalid URL` (malformed or empty), `DATABASE_URL: Invalid input: expected string, received undefined` (unset), `PORT: Invalid input: expected number, received NaN`; each exits 1.
- Hot reload works through the bind mount: after a host edit, `[tsx] change in ./src/modules/health/health.service.ts Restarting...` appeared within 1 s; the edit was reverted (file identical to the committed version).
- Prisma schema applied. `prisma migrate deploy` output: `No migration found in prisma/migrations` then `No pending migrations to apply.` (exit 0). `prisma validate` printed `The schema at prisma/schema.prisma is valid`. `git ls-files backend/src/generated` prints nothing.

## Ports and environment used on this machine

Defaults 4000 and 5432 left unchanged in `compose.yaml`. Every verification run exported `API_PORT=4010` and `DB_PORT=5440`; `WEB_PORT` was left at its default (3000) for the CORS check, so `http://localhost:3000` was the allowed origin. Database published as `127.0.0.1:5440`. Other containers on the machine (rudram-gym-postgres, n8n, vollyfi-redis, vollyfi-postgres) were not touched.

## Task Commits

1. **Task 1: End-to-end "API health reads PostgreSQL" in Compose** - `8f8ee36` (feat)
2. **Task 2: [BLOCKING] Apply the Prisma schema to the database** - no commit (`schema.prisma` did not change; the plan says commit only if it did)

**Plan metadata:** recorded in the docs(01-02) commit that follows.

## Files Created/Modified

- `compose.yaml` - project `opencrm`; `db` (127.0.0.1-only port, `db-data` volume at `/var/lib/postgresql`, `pg_isready` healthcheck) and `api` (bind mount plus `api-node-modules`, `node -e` healthcheck with 180 s start period, polling for tsx watch)
- `backend/Dockerfile` - `node:${NODE_VERSION}-slim`, OpenSSL, corepack, entrypoint; no application code baked in
- `backend/docker/dev-entrypoint.sh` - LF `sh` script: install --frozen-lockfile, prisma generate, prisma migrate deploy, `exec pnpm dev`
- `backend/.env.example` - the four variables with localhost values, commented as development-only
- `backend/prisma.config.ts`, `backend/prisma/schema.prisma` - Prisma 7 config reading `process.env.DATABASE_URL`; generator `prisma-client` to `../src/generated/prisma`, postgresql datasource, no models
- `backend/src/env.ts` - `parseEnv` (pure) and `env` (exits 1 with variable names)
- `backend/src/lib/prisma.ts` - `PrismaClient` with `PrismaPg`
- `backend/src/middleware/error-handler.ts` - four-argument error middleware, generic 500 envelope
- `backend/src/modules/health/health.{service,controller,routes}.ts` - the single health path
- `backend/src/app.ts`, `backend/src/server.ts` - `createApp()` (cors with explicit origins, json, router, error handler) and listener that checks its error argument

## Decisions Made

- Healthcheck uses `node -e fetch(...)`. Verified in the running image: `command -v curl` and `command -v wget` both print nothing; the check reports healthy. This confirms the planner's belief.
- `CHECKPOINT_DISABLE=1` is kept. The Prisma 7.10 CLI bundle (`build/cli.js`, `build/studio.js`) contains the string, so it is a recognised switch. Whether it suppresses all outbound calls was not network-tested.
- The pnpm store is moved into the `api-node-modules` volume (see deviation 2).
- Plan 01-04 note carried forward: `health.service.ts` indexes `rows[0].now`; this needs a guard once `noUncheckedIndexedAccess` is enabled. Left alone because nothing in this plan failed on it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] OpenSSL missing from the dev image**
- **Found during:** Task 1 (first `docker compose up`)
- **Issue:** `node:24-slim` ships no OpenSSL. Every Prisma command printed `prisma:warn Prisma failed to detect the libssl/openssl version ... Defaulting to "openssl-1.1.x"` and warned it "may not work as expected".
- **Fix:** Added `apt-get install -y --no-install-recommends openssl` (Debian package, not an npm dependency, so `package.json` and the lockfile are untouched) to `backend/Dockerfile`.
- **Files modified:** `backend/Dockerfile`
- **Verification:** After rebuild the warnings are gone from `docker compose logs api`; migrate deploy and health still succeed.
- **Committed in:** `8f8ee36`

**2. [Rule 3 - Blocking] pnpm store written into the host working tree**
- **Found during:** Task 1 (`git status` before commit)
- **Issue:** The container's `pnpm install` created a 469 MB content-addressable store at `backend/.pnpm-store/` through the bind mount (untracked, and files could not be hard linked to the `node_modules` volume, so they were copied).
- **Fix:** Added `pnpm_config_store_dir: /app/node_modules/.pnpm-store` to the `api` service environment. The `npm_config_store_dir` spelling was tried first and ignored by pnpm 11; the `pnpm_config_` spelling works (log now says "hard linked ... store is at /app/node_modules/.pnpm-store/v11"). Removed the stray host directory I had generated. No `.gitignore` change was needed.
- **Files modified:** `compose.yaml`
- **Verification:** Clean `down -v` then `up --wait` reached healthy, and no store directory appears in `backend/`.
- **Committed in:** `8f8ee36`

### Plan wording versus what ran

- The tracer feedback gate says an interactive run should stop for a human-verify checkpoint after the tracer commit. `workflow.auto_advance` and `_auto_chain_active` are both false, but `.planning/config.json` has `mode: yolo` and `human_verify_mode: end-of-phase`, and the orchestrator's instructions required Task 2 to run in the same pass. I re-ran the tracer verify end to end after the commit (it passed) and continued; the human look at the working slice is left to end-of-phase verification.

---

**Total deviations:** 2 auto-fixed (1 Rule 2, 1 Rule 3), 0 architectural
**Impact on plan:** Both fixes are inside the plan's own files, add no dependency, and remove noise and a 469 MB host-side artefact. No scope creep.

## Issues Encountered

- Prisma's `libssl` warning (fixed, deviation 1).
- Express's default 404 page is HTML (`Cannot GET /api/v1/nope`, 404). The JSON error envelope for unknown routes belongs to plan 01-05 and was not added here.
- An empty `backend/node_modules` directory exists on the host (Docker's mount point for the named volume). It is gitignored.
- With the database stopped, `GET /api/v1/health` returns the generic 500 envelope and the full error goes to stderr, as designed (T-02-01). Plan 01-05 changes this to `SERVICE_UNAVAILABLE`.

## Threat Surface

All register entries behave as planned: T-02-01 (500 body has no stack; verified with the database stopped), T-02-02 (only `http://localhost:3000` is allowed, `http://evil.example` gets no allow-origin header), T-02-03 (`docker compose port db 5432` prints `127.0.0.1:5440`), T-02-04 (credentials commented development-only in `compose.yaml` and `backend/.env.example`), T-02-06 (env exits naming the variable), T-01-SC (install used `--frozen-lockfile`; no manifest or lockfile change). No new threat flags.

## Known Stubs

None. The health path returns real PostgreSQL data; the schema deliberately has no models (Phase 2).

## User Setup Required

None - no external service configuration required. To run: `docker compose up -d --wait db api` (set `API_PORT`/`DB_PORT` if 4000/5432 are taken).

## Next Phase Readiness

- Plan 01-03 can attach the frontend service and call `GET /api/v1/health` from the browser; `CORS_ORIGINS` already follows `WEB_PORT`.
- Plan 01-04 (strict TypeScript, ESLint) must handle `rows[0].now` in `health.service.ts` and the extensionless relative imports.
- Plan 01-05 owns the 404 and `SERVICE_UNAVAILABLE` envelope, request IDs and OpenAPI; `exposedHeaders: X-Request-Id` is already set in CORS.
- Stack left stopped: `docker compose down` was run without `-v`, so the `opencrm_db-data` and `opencrm_api-node-modules` volumes remain (a warm restart takes about 15 s).

---
*Phase: 01-repository-foundation-standards*
*Completed: 2026-10-08*

## Self-Check: PASSED

All fourteen plan files exist on disk, commit `8f8ee36` exists in `git log`, and the Task 1 and Task 2 verify commands and acceptance criteria were re-run against the final committed state and passed.
