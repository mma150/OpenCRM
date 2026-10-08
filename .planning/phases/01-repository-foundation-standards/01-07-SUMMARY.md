---
phase: 01-repository-foundation-standards
plan: 07
subsystem: ui
tags: [tailwindcss, shadcn, radix, openapi-typescript, error-codes, nextjs, vitest]
status: complete

requires:
  - phase: 01-repository-foundation-standards
    provides: frontend tracer (plan 01-03), OpenAPI document and error codes (plan 01-05), frontend check, env module and tests (plan 01-06), approved frontend manifest (plan 01-01)
provides:
  - "Tailwind CSS 4 (postcss.config.mjs, globals.css) and shadcn/ui (radix base, nova preset) configured with exactly one component, Button"
  - "Responsive status panel: no horizontal scroll at 320, 375, 768 and 1280 px"
  - "frontend/src/lib/api/schema.d.ts generated from backend/openapi/openapi.json, committed, with a regenerate-and-diff drift check"
  - "health.types.ts: Health and HealthResponse derived from the generated schema; ApiError.code typed as ErrorCode plus client codes"
  - "Error state chosen by error.code (SERVICE_UNAVAILABLE, NETWORK_ERROR, default) with the request id shown"
affects: [01-09, 01-10, phase-02]

actuals:
  tokens: 4700
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Feature folder complete: health.types.ts (from schema.d.ts), health.api.ts, health.slice.ts, component, tests"
    - "Error messages are selected by ApiError.code in the component; known codes map to fixed client strings, the server message is shown only for unlisted codes"
    - "Type-level contract checks as vitest expectTypeOf tests, enforced by tsc through pnpm typecheck"
    - "schema.d.ts is generated, never edited; ESLint and Prettier both ignore it and src/components/ui"

key-files:
  created:
    - frontend/postcss.config.mjs
    - frontend/components.json
    - frontend/src/app/globals.css
    - frontend/src/lib/utils.ts
    - frontend/src/components/ui/button.tsx
    - frontend/src/lib/api/schema.d.ts
    - frontend/src/features/health/health.types.ts
    - frontend/src/features/health/health.types.test.ts
  modified:
    - frontend/src/app/layout.tsx
    - frontend/src/lib/api/http.ts
    - frontend/src/features/health/health.api.ts
    - frontend/src/features/health/health.slice.ts
    - frontend/src/features/health/health-status.tsx
    - frontend/src/features/health/health-status.test.tsx
    - frontend/src/features/health/health.slice.test.ts

key-decisions:
  - "Kept the shadcn-generated Geist font (next/font/google) in layout.tsx as the CLI wrote it; it fetches the font from Google at build time. Flagged for the owner (see Needs a human)"
  - "ApiError.code is ErrorCode | NETWORK_ERROR | TIMEOUT | UNKNOWN_ERROR: UNKNOWN_ERROR is a third client code the existing interceptor already produced, so the type had to include it"
  - "The server error code is cast to ErrorCode after a typeof string check; a code from a newer server still arrives as text and falls to the default UI case"
  - "Refresh uses Button size lg (36 px high) rather than the default 32 px, for a larger touch target on phones"

patterns-established:
  - "Run shadcn from the locally installed binary: pnpm exec shadcn init -y -b radix -p nova -t next --no-monorepo (works, see Issues)"
  - "Drift check for generated types: pnpm --dir frontend api:types then git diff --exit-code -- frontend/src/lib/api/schema.d.ts"

requirements-completed: [FND-05, FND-07]

coverage:
  - id: D1
    description: "Status page styled with Tailwind and one shadcn component (Button); src/components/ui holds only button.tsx; package.json, pnpm-lock.yaml and pnpm-workspace.yaml unchanged by the shadcn run"
    requirement: FND-05
    verification:
      - kind: command
        ref: "git diff --exit-code -- frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml -> exit 0 after shadcn init; ls frontend/src/components/ui -> button.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "No horizontal scroll at 320, 375, 768 and 1280 px; the page, loaded cross-origin, shows live status from the API and Refresh changes the server time"
    requirement: FND-05
    verification:
      - kind: integration
        ref: "headless Chrome over CDP against http://localhost:3010: documentElement.scrollWidth == innerWidth at all four widths; request to http://localhost:4010/api/v1/health returned 200 with Access-Control-Allow-Origin http://localhost:3010; Refresh changed 11:40:45.402Z to 11:40:46.820Z"
        status: pass
    human_judgment: true
    rationale: "Overflow and behaviour were measured; whether the panel looks good is a visual judgment (screenshots were viewed at 375 and 768 px only)"
  - id: D3
    description: "Types generated from the committed OpenAPI document with no diff on regeneration; the drift check fails when the committed file is hand-edited; no frontend file imports from backend/"
    requirement: FND-07
    verification:
      - kind: command
        ref: "pnpm --dir frontend api:types; git diff --exit-code -- frontend/src/lib/api/schema.d.ts -> exit 0; with a hand edit staged the same diff exits 1 and shows the edit; grep for backend imports in frontend/src -> none"
        status: pass
    human_judgment: false
  - id: D4
    description: "The status page shows a message selected by error code: SERVICE_UNAVAILABLE with the database stopped, NETWORK_ERROR with the API stopped, the request id when present, and recovers when the services return"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "frontend/src/features/health/health-status.test.tsx (SERVICE_UNAVAILABLE, NETWORK_ERROR, other code, request id shown, request id absent)"
        status: pass
      - kind: integration
        ref: "headless Chrome: db stopped -> alert 'The API is running but the database is unavailable' + 'Request id: aeec5e31-...' (response 503, ACAO present); db started, Refresh -> status ok, new server time; api stopped -> alert 'The API cannot be reached' (net::ERR_EMPTY_RESPONSE)"
        status: pass
    human_judgment: false
  - id: D5
    description: "getHealth returns the generated Health type and ApiError.code is the generated ErrorCode plus client codes, checked by tsc"
    requirement: FND-07
    verification:
      - kind: unit
        ref: "frontend/src/features/health/health.types.test.ts (expectTypeOf); removing TIMEOUT from ClientErrorCode made tsc fail in health.types.test.ts and http.ts; restored"
        status: pass
    human_judgment: false
  - id: D6
    description: "check, test, build and audit pass: pnpm --dir frontend check exit 0, 19 tests pass, next build exit 0 with NEXT_PUBLIC_API_URL set, pnpm audit --audit-level=high exit 0"
    requirement: FND-05
    verification:
      - kind: command
        ref: "pnpm --dir frontend check; pnpm --dir frontend test; NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1 pnpm --dir frontend build; pnpm --dir frontend audit --audit-level=high"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-10-08
---

# Phase 1 Plan 07: Tailwind, shadcn and Generated API Types Summary

**The health feature is now the full reference pattern: a Tailwind-styled, responsive status panel using one shadcn Button, types generated from the OpenAPI document with a regenerate-and-diff drift check, and an error state that picks its message from `ApiError.code`, all driven in a real browser against the running stack.**

## Performance

- **Duration:** about 40 min
- **Tasks:** 2
- **Files:** 8 created, 7 modified (no change to `package.json`, `pnpm-workspace.yaml` or `pnpm-lock.yaml`)

## What the shadcn tool changed (supply-chain record)

Command run from `frontend/`, with the locally installed approved binary (no `pnpm dlx`): `npx pnpm@11.28.5 exec shadcn init -y -b radix -p nova -t next --no-monorepo`.

- It ran non-interactively to "Project initialization completed" and created `components.json` (style `radix-nova`, base colour neutral, icon library lucide, aliases under `@/`), `src/components/ui/button.tsx` and `src/lib/utils.ts` (`export { cn } from "cn"`), rewrote `src/app/globals.css` (Tailwind import, `tw-animate-css`, `shadcn/tailwind.css`, theme variables, base layer) and edited `src/app/layout.tsx` (added a Geist `next/font/google` font and `cn`).
- It reported "Installing dependencies" but changed nothing: all packages were already in the approved manifest. After the run `git diff --exit-code -- frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml` exits 0. Nothing was restored from git, no package was added, removed or re-versioned, and no `minimumReleaseAgeExclude` entry was appended. The package-set guard did not trip.
- Afterwards the command printed `'JS' is not recognized as an internal or external command` and then an interactive "A components.json file already exists. Would you like to overwrite it?" prompt that stdin could not answer. components.json was already written correctly; I did not answer it. The cause looks like a post-step spawned through a Windows shell; it had no effect on the repository (`git status` showed only the expected files).
- `pnpm exec shadcn` (the untested form) works: with `-p nova` it never prompted for a preset. The `pnpm dlx` form from the research was not needed.

## Accomplishments

- Tailwind first, as research pitfall 9 requires: `postcss.config.mjs` registers `@tailwindcss/postcss`, `globals.css` starts with `@import "tailwindcss";` and `layout.tsx` imports it; then shadcn init succeeded on the first try.
- `src/components/ui` contains exactly `button.tsx`. ESLint and Prettier already ignore it (plan 01-06), so the generated file did not need any rule change.
- `layout.tsx` and `health-status.tsx` use Tailwind classes only (the plan 01-03 inline styles are gone): a centred card, `max-w-xl`, padding `p-4` growing to `sm:p-8`, `wrap-anywhere` so the 36-character request id cannot force sideways scroll, and a two-column definition list from the `sm` breakpoint up.
- `api:types` ran with `openapi-typescript` 7.13.0 against TypeScript 6.0.3 (the untested peer combination from plan 01-01) and worked: it generated `paths` and `components`, `tsc` passes against the output, and a second run produces no diff.
- `health.types.ts` derives `Health` and `HealthResponse` from the generated schema; `health.api.ts`, the slice and both test files import from it instead of an inline type. No file under `frontend/src` imports from `backend/`.
- `ApiError.code` is `ErrorCode | "NETWORK_ERROR" | "TIMEOUT" | "UNKNOWN_ERROR"`; the interceptor logic is unchanged apart from one commented cast.
- The failed state is chosen by `error.code` (D-12): SERVICE_UNAVAILABLE and NETWORK_ERROR show fixed client strings and not the server text; any other code shows `CODE: server message`; `Request id: ...` shows when present.

## Verification results (what was actually run)

All commands ran from the worktree root with `npx pnpm@11.28.5` (host pnpm is 10.3.0) and the stack on `API_PORT=4010 DB_PORT=5440 WEB_PORT=3010`.

| Check | Result |
| --- | --- |
| `pnpm --dir frontend install --frozen-lockfile` (fresh worktree had no node_modules) | 6.6 s, `git status` clean afterwards |
| `pnpm --dir frontend check` (final commit) | exit 0 (eslint zero warnings, prettier, tsc) |
| `pnpm --dir frontend test` | 4 files, 19 tests, all pass (was 13) |
| `pnpm --dir frontend api:types` then `git diff --exit-code -- frontend/src/lib/api/schema.d.ts` | exit 0 |
| Negative: hand edit appended to the staged `schema.d.ts`, regenerate, same diff | diff shown, exit 1; file restored and re-staged (92 added lines, no hand edit) |
| `git diff --exit-code -- frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml` | exit 0 after shadcn and at the end |
| Backend import grep over `frontend/src` | no matches |
| `docker compose up -d --wait`; `curl http://localhost:3010/` | healthy; HTML contains `data-testid="health-status"`, a stylesheet link, and the panel class list (`bg-card ... rounded-xl border p-4 shadow-sm sm:p-6`) |
| `docker compose stop db`; `curl -i http://localhost:4010/api/v1/health` | HTTP 503, `X-Request-Id` present, body `{"error":{"code":"SERVICE_UNAVAILABLE","message":"Database is unavailable","details":null}}`; `docker compose up -d --wait` returned the endpoint to 200 |
| `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1 pnpm --dir frontend build` | exit 0, routes `/` and `/_not-found` |
| `pnpm --dir frontend audit --audit-level=high` | exit 0 ("1 ignored: 1 high", the accepted braces advisory) |

TDD red step: with the five new component tests and the type test written and no implementation, `vitest run` gave 3 failed (SERVICE_UNAVAILABLE text, NETWORK_ERROR text, request id) and 16 passed (the "other code" and "no request id" tests already held). After the implementation all 19 pass. Type-test mutation: removing `"TIMEOUT"` from `ClientErrorCode` made `tsc` fail in `health.types.test.ts` and `http.ts`; reverted.

## Browser verification (headless Chrome over CDP, throwaway script outside the repo)

Page at `http://localhost:3010/`, API at `http://localhost:4010` (different origin).

- **Live status, cross-origin:** at every width the status text read "API status ok / Database server time <ISO>" and the one request to `http://localhost:4010/api/v1/health` returned 200 with `Access-Control-Allow-Origin: http://localhost:3010`. So the plan 01-06 env change and the plan 01-05 Helmet `Cross-Origin-Resource-Policy: same-origin` header do not stop the browser from reading the API response (CORP applies only to no-cors requests). Clicking Refresh at 375 px changed the time `11:40:45.402Z` -> `11:40:46.820Z` (two requests, both 200).
- **Widths (document.scrollWidth vs window.innerWidth):** 320 px -> 320/320, no overflow, panel 288 px wide; 375 px -> 375/375, panel 343 px; 768 px -> 768/768, panel 576 px; 1280 px -> 1280/1280, panel 576 px centred at x=352. Body font Geist, h1 24 px, Refresh button 73x36 px at every width.
- **Error state with the database stopped:** the alert read "The API is running but the database is unavailable" with "Request id: aeec5e31-b33b-406a-9d0b-ed26ef6c7069"; the response was 503 with CORS allowed, so the request id header is readable by the page (exposed header).
- **Recovery:** after `docker compose up -d --wait` and Refresh, the page showed status ok with a new server time (`11:44:54.773Z`, response 200).
- **API unreachable:** with the api container stopped the alert read "The API cannot be reached" (the request failed with `net::ERR_EMPTY_RESPONSE`).
- Screenshots were viewed at 375 px (ok and error) and 768 px; they look tidy. Nothing was visually checked at 1280 px beyond the measurements, and no dark mode was looked at.

## Task Commits

1. **Task 1: Install and configure Tailwind CSS and shadcn/ui, and style the status page** - `45e9f72` (feat)
2. **Task 2: Types generated from the OpenAPI document and an error state driven by error codes** - `0ecfe03` (feat)

**Plan metadata:** the docs(01-07) commit that follows. STATE.md and ROADMAP.md are left to the orchestrator.

## Decisions Made

See `key-decisions` above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `UNKNOWN_ERROR` added to the client error codes**
- **Found during:** Task 2
- **Issue:** The plan types `ApiError["code"]` as the generated `ErrorCode` plus `NETWORK_ERROR` and `TIMEOUT`, but the interceptor (plan 01-03) and the slice fallback also return `UNKNOWN_ERROR` (non-axios failure, unparseable body). With the narrower union neither compiles.
- **Fix:** `ClientErrorCode = "NETWORK_ERROR" | "TIMEOUT" | "UNKNOWN_ERROR"`. The server's code is cast to `ErrorCode` after a `typeof` string check, with a comment.
- **Files modified:** `frontend/src/lib/api/http.ts`
- **Commit:** `0ecfe03`

**2. [Rule 2 - Missing critical] Type-level test file added**
- The plan's behavior block asks for a type-level check of `getHealth`. I added `health.types.test.ts` (not in the plan's file list) with `expectTypeOf` checks for `getHealth`, `Health` and the `ApiError["code"]` union. Commit `0ecfe03`.

**3. [Rule 3 - Blocking] Existing tests and a pre-existing import updated**
- `health-status.test.tsx` and `health.slice.test.ts` imported `Health` from `health.api`; they now import it from `health.types`. The old "shows the error code and message" component test asserted `NETWORK_ERROR: Could not reach the server`, which contradicts the new behavior, so it was replaced by the five new tests. Commit `0ecfe03`.

### Differences from the plan text

- The precondition "frontend/node_modules exists on the host from plan 01-06" was false in this fresh worktree. I ran `pnpm --dir frontend install --frozen-lockfile` from the approved lockfile (clean tree afterwards) and continued; no package was added.
- The plan suggests the Task 2 verify as one chained command; the shell rejects some chained git commands, so I ran the pieces separately (output above).
- TDD: one `feat` commit for Task 2 instead of separate `test` and `feat` commits. Red was proven locally (3 failing) but not committed, so no commit in the history has a failing test suite.
- `prettier --write` reformatted the generated `globals.css` (it was 4-space indented) and `utils.ts`; `eslint --fix` reordered the imports shadcn put in `layout.tsx`. Both are our files, not ignored generated ones.
- The Next.js dev indicator (a round "N" at the bottom left) appears in the dev-mode screenshots; it is dev-only.

**Total deviations:** 3 auto-fixed (1 Rule 1, 1 Rule 2, 1 Rule 3), 0 architectural. No dependency, manifest or lockfile change.

## Issues Encountered

- Host Node 25.6.0 prints `Unsupported engine` on every pnpm call; expected, `engines` untouched.
- `vitest run` still prints the Vite "ESM syntax in a file loaded as CommonJS (vitest.config.ts)" warning (no `"type": "module"` in `frontend/package.json`). Per instruction the manifest was not changed; this remains the open owner decision from plan 01-06.
- `shadcn init` ended with the stray `'JS' is not recognized` line and an unanswerable overwrite prompt (see supply-chain record). Harmless, but contributors on Windows will see it.
- No `agent-browser`; the browser check used headless Chrome driven over CDP by a throwaway script in the session scratchpad (not committed).
- `Page` after Refresh keeps showing the last good status while a new request is loading (the slice keeps `data`); this is existing slice behavior and I did not change it.

## Known Stubs

None. Every value on the page comes from the live API; the error messages are real client strings.

## Threat Surface

T-01-SC: the locally installed `shadcn` ran; package.json, lockfile and workspace file were diffed against git after the run and are unchanged, so no unapproved package name appeared. T-07-01: messages render as React text nodes; SERVICE_UNAVAILABLE and NETWORK_ERROR map to fixed client strings and the tests assert the server text is not rendered for them. T-07-02: `schema.d.ts` is generated, lint-ignored and Prettier-ignored, and the regenerate-plus-diff check was proven to fail on a hand edit. T-07-03 accepted as planned: the request id is a random id shown to the user. New surface: `layout.tsx` (via `next/font/google`) now makes Next fetch the Geist font from Google at dev and build time. That is an outbound build-time call to a third party; no user data is sent. Raised for the owner below.

## Needs a human

- Look at the page in a normal browser at phone, tablet and desktop widths and judge the visual quality (measured: no overflow at 320, 375, 768, 1280 px; looked at 375 and 768 px only).
- Decide whether to keep the Geist font loaded from Google at build time (shadcn's generated default). Alternatives: a system font stack (no external call, no offline-build failure) or the `geist` package (a new dependency, which needs owner approval). A build with no internet access will fail while this stays. Phase 2 designs the real components, so it can be settled then.
- Vite `"type": "module"` warning for `vitest.config.ts` (carried over from plan 01-06).
- Research assumption A15 (shadcn base `radix`, preset `nova`) is still unconfirmed by the owner.

## Next Phase Readiness

- Plan 01-09 can point to `frontend/src/features/health/` as the complete example (`health.types.ts`, `health.api.ts`, `health.slice.ts`, `health-status.tsx`, three test files) and document the drift check: `pnpm --dir backend openapi:generate`, `pnpm --dir frontend api:types`, then `git diff --exit-code` on `backend/openapi/openapi.json` and `frontend/src/lib/api/schema.d.ts`.
- Plan 01-10 CI can run `api:types` plus `git diff --exit-code -- frontend/src/lib/api/schema.d.ts`, `check`, `test`, `build` (with `NEXT_PUBLIC_API_URL` set, and network access for the font) and `audit`.
- The Compose stack was stopped with `docker compose down` (no `-v`); volumes remain. `frontend/node_modules`, `frontend/.next` and `frontend/next-env.d.ts` exist in the worktree and are gitignored.

---
*Phase: 01-repository-foundation-standards*
*Completed: 2026-10-08*

## Self-Check: PASSED

All eight created files exist on disk, commits `45e9f72` and `0ecfe03` exist in `git log`, and the `check`, `test`, `api:types` drift check, manifest guard, `build`, `audit`, 503 curl and browser runs were executed against the final committed state of the code.
