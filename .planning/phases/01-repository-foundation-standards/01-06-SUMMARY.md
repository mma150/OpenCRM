---
phase: 01-repository-foundation-standards
plan: 06
subsystem: infra
tags: [eslint, prettier, typescript, vitest, testing-library, zod, nextjs, redux-toolkit]
status: complete

requires:
  - phase: 01-repository-foundation-standards
    provides: frontend tracer (store, http, health feature) from plan 01-03; approved frontend manifest and lockfile from plan 01-01
provides:
  - "pnpm --dir frontend check: ESLint (strictTypeChecked + Next rules, zero warnings), Prettier check and strict tsc in one command"
  - "Lint-enforced Redux/HTTP pattern: typed hooks only, one axios instance, no RTK Query, process.env only in src/env.ts"
  - "Zod-validated frontend environment (src/env.ts) imported by next.config.ts so dev and build fail fast"
  - "Vitest + Testing Library + jsdom setup with slice, component and env tests"
affects: [01-07, 01-08, 01-09, 01-10, phase-02]

actuals:
  tokens: 9500
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Flat ESLint 10 config: eslint-config-next core-web-vitals + typescript, typescript-eslint strictTypeChecked, simple-import-sort, unicorn kebab-case, eslint-config-prettier last"
    - "no-restricted-imports exceptions per file: src/store/hooks.ts may import raw react-redux hooks, src/lib/api/http.ts may import axios; each exception block restates the rule minus one entry"
    - "src/env.ts: pure parseEnv(source) plus top-level loadEnv() built from literal process.env reads; server exits 1, browser throws"
    - "Component and slice tests mock at the health.api module boundary and use a real makeStore() inside a react-redux Provider"
    - "Vitest globals are off; vitest.setup.ts registers Testing Library cleanup itself"

key-files:
  created:
    - frontend/eslint.config.mjs
    - frontend/prettier.config.mjs
    - frontend/.prettierignore
    - frontend/next.config.ts
    - frontend/src/env.ts
    - frontend/src/env.test.ts
    - frontend/vitest.config.ts
    - frontend/vitest.setup.ts
    - frontend/src/features/health/health.slice.test.ts
    - frontend/src/features/health/health-status.test.tsx
  modified:
    - frontend/tsconfig.json
    - frontend/src/lib/api/http.ts
    - frontend/src/features/health/health.slice.ts
    - frontend/src/store/store-provider.tsx

key-decisions:
  - "ESLint 10.12.0 runs cleanly with eslint-config-next 16.4.0 and its React/import/jsx-a11y plugins; no override or dependency change was needed"
  - "typecheck did not need `next typegen`: tsc --noEmit passes on a checkout with no .next and no next-env.d.ts, so the script is unchanged"
  - "http.ts turns off @typescript-eslint/prefer-promise-reject-errors in the config, because the interceptor rejects with the plain-object ApiError by design"
  - "tsconfig types is [node, @testing-library/jest-dom/vitest]; tests import describe/it/expect from vitest explicitly instead of using globals"

patterns-established:
  - "Run frontend gates from the repo root with pnpm --dir frontend <script>; on this machine via npx pnpm@11.28.5"
  - "Config files (*.mjs, *.config.ts) are linted with disableTypeChecked; everything else is type-checked through the project service"

requirements-completed: [FND-03, FND-05, FND-08]

coverage:
  - id: D1
    description: "One command (pnpm --dir frontend check) runs ESLint with zero warnings, Prettier check and strict tsc and exits 0 on the committed tree, including with no .next and no next-env.d.ts"
    requirement: FND-03
    verification:
      - kind: command
        ref: "npx pnpm@11.28.5 --dir frontend check -> exit 0 (also after rm -rf frontend/.next frontend/next-env.d.ts)"
        status: pass
    human_judgment: false
  - id: D2
    description: "check fails closed on untyped react-redux hooks, axios outside http.ts, RTK Query, process.env outside env.ts, non-kebab file names, any, and bad formatting"
    requirement: FND-03
    verification:
      - kind: command
        ref: "temporary edits and files, lint/check -> exit 1 with no-restricted-imports, no-restricted-properties, unicorn/filename-case, no-explicit-any; prettier --check exit 1; all reverted"
        status: pass
    human_judgment: false
  - id: D3
    description: "Build fails fast and names NEXT_PUBLIC_API_URL when it is missing or not a URL; build succeeds with a valid URL"
    requirement: FND-08
    verification:
      - kind: command
        ref: "next build with not-a-url -> exit 1; with the variable unset -> exit 1; with http://localhost:4000/api/v1 -> exit 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Vitest slice tests prove idle, loading, succeeded, failed, no second request while loading, replace-not-duplicate, and independent stores"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "frontend/src/features/health/health.slice.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "HealthStatus shows loading then status and server time, shows the error code and message, and Refresh calls getHealth again"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "frontend/src/features/health/health-status.test.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "The web container restarts with the validated env and the home page still renders the status component"
    requirement: FND-08
    verification:
      - kind: integration
        ref: "docker compose restart web; up -d --wait exit 0; curl http://localhost:3010/ contains data-testid=\"health-status\""
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-10-08
---

# Phase 1 Plan 06: Frontend Check, Env Validation and Tests Summary

**One command (`pnpm --dir frontend check`) runs strictTypeChecked ESLint with Next rules, Prettier and strict tsc and rejects untyped Redux hooks, stray axios, RTK Query and raw `process.env`; a Zod env module stops `next dev` and `next build` on a bad `NEXT_PUBLIC_API_URL`; Vitest + Testing Library prove the slice state machine and the status component.**

## Performance

- **Duration:** about 30 min (host `pnpm install --frozen-lockfile` took 41 s)
- **Tasks:** 3
- **Files:** 10 created, 4 modified

## Accomplishments

- `check` exits 0 on the committed tree and on a checkout with no `.next` and no `next-env.d.ts`. The untested risk (ESLint 10.12.0 with `eslint-config-next` 16.4.0) did not materialise: `eslint-plugin-react`, `-import` and `-jsx-a11y` all ran without crashing, and the installer printed no blocking error. The Next plugin set did report one real finding on my own `prettier.config.mjs` (`import/no-anonymous-default-export`), fixed by naming the object.
- Redux/HTTP pattern is machine-enforced (D-06): `useDispatch`/`useSelector`/`useStore` from `react-redux` only in `src/store/hooks.ts`; `axios` only in `src/lib/api/http.ts`; `@reduxjs/toolkit/query*` nowhere; `process.env` only in `src/env.ts`.
- `src/env.ts` follows the backend format; `next.config.ts` imports it, `http.ts` reads `env.NEXT_PUBLIC_API_URL`. Only `src/env.ts` reads `process.env` now.
- 13 tests in 3 files run in about 2 s with no network.
- `pnpm --dir frontend audit --audit-level=high` exits 0 ("All found vulnerabilities were already reviewed and decided to be ignored", the accepted `braces` advisory).

## Negative proofs (exact output)

`useSelector` imported from `react-redux` in `health-status.tsx`, `pnpm --dir frontend lint`:

```
src\features\health\health-status.tsx
  4:10  error  'useSelector' import from 'react-redux' is restricted. Use useAppDispatch and useAppSelector from @/store/hooks instead of the untyped react-redux hooks (D-06)  no-restricted-imports
  4:10  error  'useSelector' is defined but never used  @typescript-eslint/no-unused-vars
[ELIFECYCLE] Command failed with exit code 1.
```

Temporary `src/lib/api/other-client.ts` importing axios:

```
src\lib\api\other-client.ts
  1:1  error  'axios' import is restricted from being used. Use the shared axios instance `http` from @/lib/api/http (D-06)  no-restricted-imports
```

Temporary `src/lib/Bad-Name.tsx` using `any` and importing `@reduxjs/toolkit/query/react`, `pnpm --dir frontend check` (exit 1):

```
src\lib\Bad-Name.tsx
  1:1   error  Filename is not in kebab case. Rename it to `bad-name.tsx`  unicorn/filename-case
  1:1   error  '@reduxjs/toolkit/query/react' import is restricted from being used by a pattern. RTK Query is not used in this project. Use createAsyncThunk (D-06)  no-restricted-imports
  3:21  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
```

Temporary `src/lib/fmt-bad.ts` (`export const x    =   1`): `prettier --check .` exits 1 and lists the file. Temporary `src/lib/env-leak.ts` (`process.env.SECRET`): `'process.env' is restricted from being used ... no-restricted-properties`, exit 1. All temporary files were deleted and the edit reverted; `check` exits 0 again afterwards.

Build negative proofs (`next build`):

```
NEXT_PUBLIC_API_URL=not-a-url      -> "Invalid environment configuration:\n  - NEXT_PUBLIC_API_URL: Invalid URL"  (exit 1)
NEXT_PUBLIC_API_URL unset          -> "Invalid environment configuration:\n  - NEXT_PUBLIC_API_URL: Invalid input: expected string, received undefined"  (exit 1)
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1 -> build succeeds (exit 0), routes / and /_not-found
```

Mutation check for the slice tests: changing the thunk `condition` to `... !== "loading" || true` made "starts no second request while one is loading" fail (`expected "vi.fn()" to be called 1 times, but got 2 times`); reverted.

## Compliance edits to existing sources

- `health.slice.ts`: `_arg: void` became `_arg: undefined` (`@typescript-eslint/no-invalid-void-type`). `dispatch(fetchHealth())` still takes no argument and the tests call it that way.
- `http.ts`: `const requestId: unknown = ...headers["x-request-id"]` (`no-unsafe-assignment`); the later `typeof requestId === "string"` guard is unchanged. The axios base URL then moved to `env.NEXT_PUBLIC_API_URL` (Task 2).
- `store-provider.tsx`: import specifier order only.
- `layout.tsx`, `page.tsx`, `health-status.tsx`, `health.api.ts`, `store/index.ts`, `store/hooks.ts` needed no edit.
- `tsconfig.json`: added `noUncheckedIndexedAccess` and `types`; Prettier reflowed the arrays. `strict` was already true, `paths` has no `baseUrl`.

## Task Commits

1. **Task 1: Frontend check command with Redux pattern rules** - `e00676b` (chore)
2. **Task 2: Validate the frontend environment at startup** - `833f76c` (feat)
3. **Task 3: Frontend test setup with slice and component tests** - `0f36b5c` (test)

**Plan metadata:** the docs(01-06) commit that follows. STATE.md and ROADMAP.md are left to the orchestrator.

## Decisions Made

See `key-decisions` above. `package.json` is unchanged in every commit (no dependency, script or version change); `pnpm-workspace.yaml` and `pnpm-lock.yaml` are untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `process.env` restriction added in Task 2, not Task 1**
- **Found during:** Task 1
- **Issue:** The plan has Task 1 enforce "process.env only in src/env.ts", but `http.ts` still read `process.env` until Task 2 moved it to the env module, so `check` could not pass in the Task 1 commit with the rule on.
- **Fix:** The `no-restricted-properties` rule and its `src/env.ts` exception were added in the Task 2 commit together with the env module. After Task 2 the rule is active and proven by a temporary file.
- **Files modified:** `frontend/eslint.config.mjs`
- **Commit:** `833f76c`

**2. [Rule 3 - Blocking] `prefer-promise-reject-errors` turned off for `http.ts`**
- **Found during:** Task 1 (first lint run)
- **Issue:** The response interceptor rejects with the plain-object `ApiError` on purpose (decided in plan 01-03); `strictTypeChecked` requires an `Error`.
- **Fix:** `@typescript-eslint/prefer-promise-reject-errors: off` for `src/lib/api/http.ts` only, with a comment, rather than an inline disable or a behaviour change.
- **Commit:** `e00676b`

**3. [Rule 2 - Missing critical] Added `src/env.test.ts`**
- Not in the plan's file list. Three small tests that `parseEnv` accepts a URL and names `NEXT_PUBLIC_API_URL` when missing or invalid, mirroring the backend's env test. Commit `0f36b5c`.

**4. [Rule 3 - Blocking] Testing Library cleanup registered by hand**
- Vitest globals are off (tests import from `vitest`), so Testing Library's automatic cleanup does not register. `vitest.setup.ts` calls `cleanup()` in `afterEach`. Commit `0f36b5c`.

**Total deviations:** 4 (3 Rule 3, 1 Rule 2), 0 architectural. No dependency, manifest or lockfile change.

### Process note on TDD

The slice and component already existed from plan 01-03, so the new tests passed on first run rather than failing first. I proved they can fail with the mutation described above instead of a red commit; there is one `test(...)` commit and no `feat(...)` commit for Task 3 because no production code needed to change.

## Issues Encountered

- Host Node 25.6.0 prints `Unsupported engine` on every pnpm call; expected, `engines` untouched. Host `pnpm` is 10.3.0 so every command ran as `npx pnpm@11.28.5`.
- `vitest run` prints a Vite warning: "ESM syntax in a file loaded as CommonJS (vitest.config.ts)", because `frontend/package.json` has no `"type": "module"`. It is harmless (the config loads and tests pass). The fixes are `"type": "module"` in `package.json` or a `.mts` config name; the first changes the approved manifest and the second contradicts the plan's file name, so I left both alone. Contributors can set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true`. Raising this as a decision for the owner.
- The shell in this environment rejects chained commands, so the plan's single-line `build && ( ... ) && grep` verify was run as separate commands (same checks, output shown above) and the log went to the terminal rather than `/tmp`.

## Known Stubs

None.

## Threat Surface

T-06-01: only `src/env.ts` reads `process.env` (lint rule proven by a temporary file) and the schema has only `NEXT_PUBLIC_API_URL`. T-06-02: a bad URL stops `next build` and names the variable (proven). T-06-03: axios import outside `http.ts` fails lint (proven). T-01-SC: install used `--frozen-lockfile`; `git status` was clean afterwards and `package.json` is unchanged. No new threat flags.

## Needs a human

- Decide how to silence the Vite "ESM syntax in a file loaded as CommonJS" warning on the frontend (see Issues Encountered). Not blocking.
- Open the home page in a browser: the env change was verified by container health and by the served HTML containing `data-testid="health-status"`, not by a browser run that fetches live status (the thunk runs client-side, and the browser check from plan 01-03 was not repeated).

## Next Phase Readiness

- Plan 01-07 (Tailwind/shadcn): `src/components/ui` and `src/lib/api/schema.d.ts` are already ignored by ESLint and Prettier; generated `next-env.d.ts` is ignored by ESLint. After a Next build, `next-env.d.ts` and `.next` exist and are gitignored.
- CI (plan 01-10) can call `check`, `test`, `build` (with `NEXT_PUBLIC_API_URL` set) and `audit` as defined.
- The Compose stack was stopped with `docker compose down` (no `-v`); nothing from this project is running. `frontend/node_modules` exists in the worktree and is gitignored.

---
*Phase: 01-repository-foundation-standards*
*Completed: 2026-10-08*
