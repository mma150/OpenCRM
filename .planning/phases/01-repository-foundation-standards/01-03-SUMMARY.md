---
phase: 01-repository-foundation-standards
plan: 03
subsystem: infra
tags: [docker-compose, nextjs, redux-toolkit, axios, createAsyncThunk, health-feature, readme]
status: complete

requires:
  - phase: 01-repository-foundation-standards
    provides: db and api Compose services and GET /api/v1/health (plan 01-02); approved frontend manifest and lockfile (plan 01-01)
provides:
  - web Compose service (Next.js dev, webpack mode, polling hot reload) so one `docker compose up` starts db, api and web
  - Redux store factory (makeStore), typed hooks, StoreProvider
  - Single shared axios instance (http) that rejects every failure as an ApiError
  - Health feature (api, slice with fetchHealth thunk, HealthStatus component) rendered by the home page
  - README Quick start and Repository layout
affects: [01-04, 01-05, 01-06, 01-07, 01-09, phase-02]

actuals:
  tokens: 3800
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Feature folder src/features/<feature>/ with <feature>.api.ts, <feature>.slice.ts and a component; route files only render the feature component (D-05, D-07)"
    - "Thunk via createAsyncThunk.withTypes<{ state, rejectValue: ApiError }>(), type string health/fetch, condition skips while loading (D-06)"
    - "All HTTP goes through one axios instance whose response interceptor converts server envelopes, network errors and timeouts to ApiError"
    - "Store is a factory (makeStore) created once per StoreProvider mount with useState(makeStore); no store instance is exported"
    - "Dev container: dependencies installed at every start from the frozen lockfile, pnpm store kept inside the node_modules volume, next dev --webpack with WATCHPACK_POLLING"

key-files:
  created:
    - README.md
    - frontend/Dockerfile
    - frontend/.env.example
    - frontend/tsconfig.json
    - frontend/src/app/layout.tsx
    - frontend/src/app/page.tsx
    - frontend/src/store/index.ts
    - frontend/src/store/hooks.ts
    - frontend/src/store/store-provider.tsx
    - frontend/src/lib/api/http.ts
    - frontend/src/features/health/health.api.ts
    - frontend/src/features/health/health.slice.ts
    - frontend/src/features/health/health-status.tsx
  modified:
    - compose.yaml

key-decisions:
  - "web healthcheck is a node -e fetch of http://localhost:3000 with a 240 s start period; it reported healthy on every run (no need for 127.0.0.1)"
  - "Layout uses a few inline styles (max-width, wrapping, padding) so the unstyled page is readable at phone width until the Tailwind/shadcn plan; no horizontal scroll at 375 px"
  - "mobile/ is named in the README layout as reserved and not yet created, since the folder does not exist"
  - "pnpm store for the web container is relocated into the web-node-modules volume (pnpm_config_store_dir), same as the api service, so nothing lands in frontend/ on the host"

patterns-established:
  - "Verification ports on this machine: API_PORT=4010, DB_PORT=5440, WEB_PORT=3010 (committed defaults 4000/5432/3000 unchanged); the API CORS allow-list and NEXT_PUBLIC_API_URL both follow these variables"

requirements-completed: [FND-01, FND-04, FND-05]

coverage:
  - id: D1
    description: "docker compose up -d --wait starts db, api and web and all three report healthy"
    requirement: FND-04
    verification:
      - kind: integration
        ref: "docker compose up -d --wait; docker compose ps -> api healthy, db healthy, web healthy (clean volumes, 179-187 s)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Home page loads live status through the Redux store: the thunk runs in the browser, shows status ok and the PostgreSQL server time, and Refresh changes the time"
    requirement: FND-05
    verification:
      - kind: integration
        ref: "headless Chrome over CDP at 375 px: first read '2026-10-08T10:47:08.041Z', after clicking Refresh '2026-10-08T10:47:14.926Z'; two requests to http://localhost:4010/api/v1/health"
        status: pass
    human_judgment: false
  - id: D3
    description: "Cross-origin read is allowed for the web origin only"
    requirement: FND-04
    verification:
      - kind: integration
        ref: "curl -sI -H 'Origin: http://localhost:3010' .../api/v1/health -> Access-Control-Allow-Origin: http://localhost:3010 (evil origin check was done in plan 01-02)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Host edit to health-status.tsx updates the served page without a rebuild"
    requirement: FND-04
    verification:
      - kind: integration
        ref: "edited loading text on host; page HTML contained the new text within 8-12 s; revert removed it again"
        status: pass
    human_judgment: false
  - id: D5
    description: "README Quick start works from empty volumes and a second `up -d --wait` converges; an interrupted first start converges on re-run"
    requirement: FND-04
    verification:
      - kind: integration
        ref: "down -v, up -d --wait (exit 0), up -d --wait again (exit 0, 1 s); down -v, up -d, kill at 40 s, up -d --wait (exit 0, 62 s)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Home page is usable at phone, tablet and desktop widths"
    requirement: FND-01
    verification:
      - kind: integration
        ref: "headless Chrome at 375 px: document.scrollWidth <= innerWidth is true"
        status: pass
    human_judgment: true
    rationale: "Only phone width was measured, and only for horizontal overflow; visual quality at tablet and desktop widths needs a human in a browser. The real design system arrives in a later plan."

duration: 25min
completed: 2026-10-08
---

# Phase 1 Plan 03: Walking-Skeleton Tracer (web health) Summary

**The Next.js home page loads live PostgreSQL-backed status through a `createAsyncThunk` -> shared axios instance -> Redux store -> `useAppSelector` path from `/api/v1/health`, all started by one `docker compose up` and documented in a README Quick start.**

## Performance

- **Duration:** about 25 min
- **Tasks:** 2 (Task 1 tracer, Task 2 README)
- **Files:** 13 created, 1 modified (`compose.yaml`)

## Accomplishments

- `web` Compose service added next to `db` and `api`: `node:24-slim` image, `next dev --webpack -H 0.0.0.0 -p 3000`, `WATCHPACK_POLLING=true`, `NEXT_TELEMETRY_DISABLED=1`, `NEXT_PUBLIC_API_URL` built from `API_PORT`, volumes `web-node-modules` and `web-next`, healthcheck with a 240 s start period. `docker compose ps` reports db, api and web healthy.
- Store layer: `makeStore` (no exported instance), `AppStore`/`RootState`/`AppDispatch`, `useAppDispatch`/`useAppSelector` built with `.withTypes`, client `StoreProvider` using `useState(makeStore)`.
- `http` is the only axios instance; its response interceptor turns every failure into an `ApiError` (`NETWORK_ERROR`, `TIMEOUT`, or the server envelope's code, message and details, plus `requestId` from `X-Request-Id`).
- Health feature in `frontend/src/features/health/`: `getHealth`, `fetchHealth` (type `health/fetch`, `rejectValue: ApiError`, `condition` skips while loading), `healthReducer`, `selectHealth`, and the `HealthStatus` component with `data-testid="health-status"` and a Refresh button. `src/app/page.tsx` only renders it.
- README with `## Quick start` and `## Repository layout`; room left for plan 01-09's links.

## Verification results (what was actually run)

- **Task 1 automated verify** (with `API_PORT=4010 DB_PORT=5440 WEB_PORT=3010`): `docker compose up -d --wait` exit 0; `curl http://localhost:3010/` contains `data-testid="health-status"`; API returns `{"data":{"status":"ok","database":{"connected":true,"serverTime":"2026-10-08T10:43:22.943Z"}},"meta":{}}`; response with `Origin: http://localhost:3010` carries `Access-Control-Allow-Origin: http://localhost:3010` and `Access-Control-Expose-Headers: X-Request-Id`. Re-run after the commit for the tracer gate: pass.
- **Real browser check** (headless Chrome driven over CDP at 375 px width, because the thunk runs client-side): the page rendered `API status ok` and `Database server time 2026-10-08T10:47:08.041Z`; clicking Refresh changed it to `2026-10-08T10:47:14.926Z`; the network log shows exactly two requests to `http://localhost:4010/api/v1/health`; the page has no horizontal scroll at 375 px.
- **Acceptance greps:** `axios.create` appears only in `frontend/src/lib/api/http.ts`; no `useDispatch`/`useSelector` in `src/features` or `src/app`; no `@reduxjs/toolkit/query` import; `store/index.ts` exports `makeStore` and types only; `page.tsx` imports `@/features/health/health-status` and has no fetch, axios or store code; no `dangerouslySetInnerHTML`.
- **Type check:** `docker compose exec web pnpm exec tsc --noEmit` exit 0.
- **Hot reload:** editing the loading text in `health-status.tsx` on the host changed the served HTML within 8-12 s; the edit was reverted and the change disappeared again.
- **Task 2 automated verify:** `down -v`, `up -d --wait`, `up -d --wait`, API health `"status":"ok"`, web page contains `health-status`, README greps: all exit 0 (`TASK2_VERIFY_PASS`).
- **Clean-volume start duration:** 179 s, 187 s and 93 s (the 93 s run reused the api volumes from plan 01-02, so only the web side was cold). A second `up -d --wait` returned in 1 s.
- **Interrupted first start:** `down -v`, `up -d`, `docker compose kill` at 40 s, then `up -d --wait` exited 0 in 62 s with all three healthy, no manual cleanup.
- **tsconfig keys Next added on first run:** `jsx` was changed from `preserve` to `react-jsx`, and `include` gained `.next/dev/types/**/*.ts`. Next also reformatted the arrays to one item per line. The result is what was committed.

## Task Commits

1. **Task 1: End-to-end "home page shows live status through the Redux store"** - `54681c2` (feat)
2. **Task 2: README Quick start, proven from a clean volume** - `9c27631` (docs)

**Plan metadata:** this SUMMARY is committed in the docs(01-03) commit that follows. STATE.md and ROADMAP.md are left to the orchestrator.

## Decisions Made

- Kept `localhost` in the web healthcheck as the plan specified; it reported healthy on all runs.
- Added a handful of inline layout styles in `layout.tsx` (max width, padding, `overflow-wrap`) so the page reads well on a phone without introducing a styling framework in this plan.
- `mobile/` is listed in the README as reserved and not yet created, because FND-01's mobile folder does not exist in the repository.

## Deviations from Plan

### Auto-fixed Issues

None required fixing during execution.

### Differences from the plan text

**1. Acceptance wording about a "recompile line" in `docker compose logs web`**
- The plan says a host edit should produce a recompile line in the web logs. Next 16 dev in webpack mode printed no "Compiled" or "Compiling" line after the first page build. The evidence of the recompile is instead (a) the served HTML contained the edited text within 8-12 s, and (b) the first request after each edit logged `GET / 200 in 138-273ms` against about 20 ms for cached requests. Hot reload is proven by the content change; the literal log-line wording is not met and I did not add a flag to force one.

**2. Tracer feedback gate**
- Same situation as plan 01-02: auto-advance flags are false but `.planning/config.json` is in `yolo` mode with `human_verify_mode: end-of-phase`, and the orchestrator required Task 2 in the same pass. I re-ran the tracer's automated verify after the commit (pass) plus the browser check, and continued. The human look at the working slice is left to end-of-phase verification.

**Total deviations:** 0 auto-fixed, 2 wording/process differences noted above. No dependency, manifest or lockfile change; `pnpm install --frozen-lockfile` succeeded in the container on every start.

## Issues Encountered

- `agent-browser open` hung until the tool timeout, so the browser check was done with headless Chrome driven over the DevTools protocol by a throwaway script kept outside the repository.
- The first cold web start spends most of its time in `pnpm install` through the bind mount, then compiles the first page; the 240 s start period covers it.

## Known Stubs

None. Every value on the page comes from the live API and PostgreSQL.

## Threat Surface

T-03-01: values are rendered as React text nodes only, no `dangerouslySetInnerHTML`. T-03-02: `NEXT_PUBLIC_API_URL` is a public URL, no secret. T-03-03: `NEXT_TELEMETRY_DISABLED=1` is set in both the Dockerfile and the `web` service environment (absence of outbound calls was not packet-tested). T-03-04: `Access-Control-Allow-Origin` matches only the configured web origin. T-01-SC: installs used `--frozen-lockfile`; `package.json`, `pnpm-workspace.yaml` and `pnpm-lock.yaml` are unchanged. No new threat flags.

## Needs a human

- Look at http://localhost:3000 (or your `WEB_PORT`) at phone, tablet and desktop widths. Only phone width (375 px) was checked, and only for horizontal overflow. The page is deliberately plain until the design-system plan.

## Next Phase Readiness

- Plan 01-04 (strict TypeScript, ESLint) will touch the frontend files created here; `health.slice.ts` casts the rejected error to `ApiError` and `tsconfig.json` already contains Next's additions. The slice imports `RootState` from `@/store`, which imports the slice back (type-only, no runtime cycle).
- Plan 01-06 replaces the literal `process.env.NEXT_PUBLIC_API_URL` read in `http.ts` with the Zod env module (keep the read literal).
- Plan 01-09 can extend the README below the layout section.
- Stack stopped with `docker compose down` (no `-v`): volumes `opencrm_db-data`, `opencrm_api-node-modules`, `opencrm_web-node-modules` and `opencrm_web-next` remain. Nothing is running from this project.

---
*Phase: 01-repository-foundation-standards*
*Completed: 2026-10-08*

## Self-Check: PASSED

All thirteen created files and the modified `compose.yaml` exist on disk; commits `54681c2` and `9c27631` exist in `git log`; Task 1 and Task 2 verify commands and the acceptance greps were run against the committed state and passed (the literal "recompile log line" wording is recorded as a difference above).
