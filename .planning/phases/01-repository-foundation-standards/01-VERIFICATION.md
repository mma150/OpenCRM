---
phase: 01-repository-foundation-standards
verified: 2026-10-08T12:59:00Z
status: passed
score: 3/5 roadmap truths verified (2 present-behavior-unverified, 6 backstop truths abstain to human)
covered_files:
  - .github/dependabot.yml
  - .github/workflows/audit.yml
  - .github/workflows/ci.yml
  - .planning/phases/01-repository-foundation-standards/01-01-PLAN.md
  - .planning/phases/01-repository-foundation-standards/01-01-SUMMARY.md
  - .planning/phases/01-repository-foundation-standards/01-02-PLAN.md
  - .planning/phases/01-repository-foundation-standards/01-02-SUMMARY.md
  - .planning/phases/01-repository-foundation-standards/01-03-PLAN.md
  - .planning/phases/01-repository-foundation-standards/01-03-SUMMARY.md
  - .planning/phases/01-repository-foundation-standards/01-04-PLAN.md
  - .planning/phases/01-repository-foundation-standards/01-04-SUMMARY.md
  - .planning/phases/01-repository-foundation-standards/01-05-PLAN.md
  - .planning/phases/01-repository-foundation-standards/01-05-SUMMARY.md
  - .planning/phases/01-repository-foundation-standards/01-06-PLAN.md
  - .planning/phases/01-repository-foundation-standards/01-06-SUMMARY.md
  - .planning/phases/01-repository-foundation-standards/01-07-PLAN.md
  - .planning/phases/01-repository-foundation-standards/01-07-SUMMARY.md
  - .planning/phases/01-repository-foundation-standards/01-08-PLAN.md
  - .planning/phases/01-repository-foundation-standards/01-08-SUMMARY.md
  - .planning/phases/01-repository-foundation-standards/01-09-PLAN.md
  - .planning/phases/01-repository-foundation-standards/01-09-SUMMARY.md
  - .planning/phases/01-repository-foundation-standards/01-10-PLAN.md
  - .planning/phases/01-repository-foundation-standards/01-10-SUMMARY.md
  - README.md
  - SECURITY.md
  - backend/package.json
  - backend/src/app.ts
  - commitlint.config.mjs
  - compose.yaml
  - frontend/.prettierignore
  - frontend/package.json
  - frontend/src/features/health/health.slice.ts
covered_digest: "v3:sha256:1cda27a5933cedc843831df6caade3abb4a172ae7b46cc2dddc3e0c2783483ef"
behavior_unverified: 2
overrides_applied: 0
behavior_unverified_items:
  - truth: "SC4: GitHub Actions run lint, type-check, test and build for both apps on every push and pull request, and a pull request that breaks the commit standard fails CI"
    test: "Push main to a GitHub remote, open a throwaway pull request titled `Bad title`, then edit it to `chore: test title check`"
    expected: "ci shows frontend and backend green on the push; pr-title fails on `Bad title` and passes after the edit; a second push to the same ref cancels the in-flight run"
    why_human: "No GitHub remote exists, so no workflow has ever run. The workflow files are present and wired, and every command they run passes locally (see Behavioral Spot-Checks), but the Actions execution, the action versions pinned in them (checkout@v7, setup-node@v7, pnpm/action-setup@v6, dependency-review-action@v5, codeql-action@v4) and branch-protection behaviour cannot be observed from files."
  - truth: "SC5: Dependabot, CodeQL (on pull requests and on a schedule) and secret scanning are configured so that a committed credential is caught"
    test: "After the first push: check Insights -> Dependency graph -> Dependabot for config errors, confirm the first CodeQL run under Security -> Code scanning, push a made-up credential to a throwaway branch with push protection on, and confirm the `gitleaks` job runs"
    expected: "Dependabot lists all seven ecosystems with no error and opens grouped PRs; CodeQL uploads results for the PR and for main; push protection blocks the credential; gitleaks reports the same commit count as the host"
    why_human: "dependabot.yml (cooldown, `routine` group, ignores), codeql.yml and secrets.yml are present and consistent (verify-foundation checks 10-12 pass), but whether GitHub accepts them and what it does with them is only visible after a push. The local layer (pre-commit gitleaks) was exercised and works."
human_verification:
  - test: "Open the home page in a real browser on the running Compose stack and press Refresh"
    expected: "Status `ok` and a PostgreSQL server time appear (not the SSR 'Loading status...' line), and Refresh changes the displayed time; layout is readable at phone, tablet and desktop widths with no horizontal scroll"
    why_human: "My browser run hung, so the rendered page was not observed. The pieces were verified separately (API 200 with the envelope, CORS allows the web origin, SSR page serves, 19 component and slice tests pass including loading -> succeeded and Refresh). Visual quality at tablet/desktop was already flagged as a human item in plan 01-03."
  - test: "Backstop truth, plan 01-01: the three app folders have no order-dependent behaviour (install and build in any order, same result)"
    expected: "Install and build frontend, backend and root in a different order on a clean checkout; identical outputs"
    why_human: "Non-inferable; presence and wiring do not qualify. I installed/ran each app independently and saw no cross-dependency (separate lockfiles, `pnpm ls -r` lists only the root package), but no property or held-out test exists. Low risk."
  - test: "Backstop truth, plan 01-09: LICENSE, CONTRIBUTING.md and CODE_OF_CONDUCT.md are static with no runtime behaviour"
    expected: "Files render on GitHub; licence is detected as Apache-2.0"
    why_human: "Abstained under the backstop rule. Directly read: all three are plain markdown/text. LICENSE is 11358 bytes, the size of the canonical Apache-2.0 text."
  - test: "Backstop truths, plan 01-10 (four): CI jobs are independent and may finish in any order; Dependabot opens no duplicate PR for an unchanged manifest; templates are static; branch rules behave under concurrent pull requests"
    expected: "Confirmed on GitHub after the first push and the first Monday (checklist items 6 and 8 in docs/standards/github-settings.md)"
    why_human: "GitHub-side behaviour. ci.yml jobs have no `needs`, and no job consumes another's output, but that is a structural reading, not a behavioural proof."
  - test: "Fill the two owner-input placeholders and decide on the bracketed NOTE in the Contributor Covenant"
    expected: "`[OWNER TO SET: security contact]` (SECURITY.md) and `[OWNER TO SET: conduct contact]` (CODE_OF_CONDUCT.md) replaced with a published contact; `pnpm verify:foundation` no longer prints WARN lines"
    why_human: "Owner decision. The prohibition on publishing a personal address is met (no email in any tracked public file), but SEC-04 'how to report' currently depends on GitHub private reporting being switched on, because the fallback contact is a token."
  - test: "Apply the repository settings in docs/standards/github-settings.md (branch protection with the seven checks and one approval, squash-only, push protection, private vulnerability reporting, CodeQL default setup off)"
    expected: "Checklist 'After the first push' items 1-8 all pass"
    why_human: "Settings are not files. CTB-05 documentation exists; enforcement does not until the owner applies it."
  - test: "Decide two carried-over owner items: Geist font fetched from Google at build time, and the Vite `type: module` warning in frontend tests"
    expected: "Either accepted or resolved before Phase 2"
    why_human: "Owner decisions recorded in 01-06 and 01-07 summaries. A frontend build with no internet access fails while the font fetch stays."
---

# Phase 1: Repository Foundation & Standards Verification Report

**Phase Goal:** As a contributor, I want to run the full stack locally with enforced standards, CI and security tracking, so that every later phase is built the same way.
**Verified:** 2026-10-08T12:59:00Z
**Status:** human_needed
**Re-verification:** No, initial verification

## Goal Achievement

The goal is substantively achieved in the codebase. I started the real stack, ran every check command, exercised the enforcement mechanisms (lint rules, commit hook, secret hook, env fail-fast), and read the CI and security configuration. No must-have failed. Status is `human_needed` rather than `passed` because the CI, CodeQL, Dependabot, push-protection and branch-protection parts can only be observed on GitHub (no remote exists), one browser render was not observed, six backstop truths abstain, and one reproducible Windows-only defect needs a decision (see Anti-Patterns).

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | From the README, a contributor starts the database, API and web app, and the home page shows live status loaded through the Redux store (typed hooks) from the versioned health endpoint, which reads PostgreSQL | VERIFIED | `docker compose up -d --wait` with `API_PORT=4010 DB_PORT=5440 WEB_PORT=3010` converged: db, api, web all healthy. `GET /api/v1/health` returned 200 `{"data":{"status":"ok","database":{"connected":true,"serverTime":"2026-10-08T12:49:32.389Z"}},"meta":{}}`; the service runs `SELECT now()` through Prisma and maps failure to 503 SERVICE_UNAVAILABLE. Web SSR page serves with the Refresh button. Chain traced: `page.tsx` -> `HealthStatus` -> `useAppDispatch`/`useAppSelector` (`store/hooks.ts`, `.withTypes`) -> `fetchHealth` thunk -> `health.api.ts` -> the single `http` axios instance -> `/health`. CORS allows the web origin (`Access-Control-Allow-Origin: http://localhost:3010`) and not `evil.example`. 19 frontend tests pass, including loading -> succeeded and Refresh re-dispatch. Rendered-in-browser confirmation is a human item. |
| 2 | Separate `frontend/` (Next.js), `backend/` (Express + Prisma), reserved `mobile/`; written standards define structure, naming, backend layering and the frontend slice/API pattern, which the skeleton follows | VERIFIED | All three folders exist; `mobile/` tracks exactly one file (README.md). `docs/standards/{structure,frontend,backend,testing,commits,security,github-settings}.md` and four decision records exist with the required headings; verify-foundation checks 01, 02, 07, 13 pass. Skeleton follows them: routes -> controller -> service -> Prisma in `modules/health`; feature folder `features/health` with types/api/slice/component/tests. |
| 3 | One command per app runs lint, format check and strict TS and fails on violations; a missing/invalid env variable fails immediately and clearly; each app has `.env.example`; the API serves a versioned OpenAPI document | VERIFIED (with warning W1) | `npx pnpm@11.28.5 --dir backend check` exit 0. Frontend `check`: eslint passes, `tsc --noEmit` exit 0, Prettier fails only on the gitignored generated `next-env.d.ts` (W1); the committed tree is clean. Enforcement proven by feeding violations to ESLint on stdin: `any` -> `no-explicit-any`; routes importing a service -> error; controller importing `../../lib/prisma` -> error; `useSelector` from react-redux, `axios`, and `@reduxjs/toolkit/query/react` -> all `no-restricted-imports`. Backend with `DATABASE_URL` unset prints `DATABASE_URL: Invalid input...` exit 1; with `notaurl` prints `Invalid URL` exit 1. `next build` with `NEXT_PUBLIC_API_URL=notaurl` prints the variable name, exit 1. `GET /api/v1/openapi.json` returns OpenAPI 3.1.0. `openapi:generate` and `api:types` regenerate with zero git diff. verify-foundation check 05 (every Zod env key is in `.env.example`) passes. |
| 4 | A bad commit message is rejected locally; a PR that breaks it fails CI; GitHub Actions run lint, type-check, test and build for both apps on every push and PR | PRESENT_BEHAVIOR_UNVERIFIED | Local half VERIFIED: `.husky/commit-msg` run against a no-type message exit 1, a Co-Authored-By message exit 1, a compliant message exit 0; `test:commitlint` 19 of 19 fixtures (72/73 boundary, non-ASCII, emoji, empty, AI trailers); `core.hooksPath` is `.husky/_`; all 61 commits in history conform, none carries an attribution trailer. CI half: `ci.yml` (frontend and backend jobs, push and pull_request, no path filters, concurrency group) and `pr-title.yml` (title via `PR_TITLE` env, re-runs on `edited`) are present and correct, and each command they run passes locally. Never executed on GitHub. |
| 5 | LICENSE (Apache-2.0), CONTRIBUTING, CODE_OF_CONDUCT, PR and issue templates, documented branch/PR rules and SECURITY.md exist, with Dependabot, CodeQL (PRs and schedule) and secret scanning configured so a committed credential is caught | PRESENT_BEHAVIOR_UNVERIFIED | Files all exist and are substantive: LICENSE 11358 bytes Apache-2.0; CODE_OF_CONDUCT is Contributor Covenant 3.0 with one token replaced; CONTRIBUTING has branch naming, squash-only, title rule, required checks, one approval; PR template, bug and feature issue forms, `config.yml`; SECURITY.md has `## Reporting a vulnerability`. `dependabot.yml` has seven ecosystems with `routine` group and `chore` prefix; `codeql.yml` has pull_request, push and weekly schedule; `audit.yml` and `secrets.yml` have no `continue-on-error`. Local secret layer VERIFIED: `test:secret-hook` 4 of 4 (credential blocked, harmless passes, no scanner fails closed, dead Docker fails closed). GitHub-side behaviour (Dependabot acceptance, CodeQL results, push protection) cannot be observed. |

**Score:** 3/5 roadmap truths verified; 2 present, behavior-unverified (GitHub-side); 6 backstop truths abstain (listed under Human Verification).

### Plan-level must-haves cross-check

All plan `must_haves.truths` roll up into the five criteria above. Items I checked individually beyond the roadmap wording:

| Plan truth | Status | Evidence |
| --- | --- | --- |
| Every dependency exact-pinned; typescript 6.0.3, prisma and @prisma/client 7.10.0, eslint 10.12.0; `.nvmrc` 24; `engines` and `packageManager` identical | VERIFIED | Read all three `package.json` files; no `^`, `~` or `*`; verify-foundation check 03 and 04 pass. |
| Root lists only the tooling package; apps are not workspace members | VERIFIED | `pnpm ls -r --depth -1` prints only `opencrm@0.0.0`. |
| `pnpm audit --audit-level=high` exits 0 in both apps | VERIFIED | Root: no vulnerabilities. Backend: 1 low, exit 0. Frontend: "1 ignored: 1 high" exit 0 (one run crashed in the host Node 25 runtime with a V8 stack trace and passed on retry). The ignore is a dated row in `docs/standards/security.md` and an `ignoreGhsas` entry. |
| Env parsed once, before any listener; `process.env` read only in `env.ts` | VERIFIED | `server.ts` imports `env` before `listen`; ESLint `no-restricted-properties` on `process.env`; `src/env.test.ts` names variables. |
| Every error has `error.code/message/details`; 404, 400, 503, 500 mapping; no stack in bodies; X-Request-Id and one log line per request; parallel requests independent | VERIFIED | `error-handler.ts` read; live 404 returned `{"error":{"code":"NOT_FOUND","message":"Route not found","details":null}}`; 36 backend tests pass against real PostgreSQL, including the parallel-requests, one-log-line, redaction and 503 tests. |
| Generated OpenAPI is deterministic and drift is a test failure | VERIFIED | Regeneration produced no diff; `openapi.test.ts` compares the committed file; CI also diffs. |
| Slice dedupes a dispatch while loading and replaces data on a later success; each StoreProvider mount has its own store | VERIFIED | `condition` guard in `health.slice.ts`; `makeStore` factory in `store/index.ts` with `useState(makeStore)`; tests "starts no second request while one is loading", "replaces the data...", "returns independent stores". |
| Commit hook rejects empty, no-type, empty-subject; 72 passes, 73 fails; AI attribution rejected | VERIFIED | `test:commitlint` 19/19 plus direct hook runs above. |
| Staged credential blocked; scanning never silently skipped | VERIFIED | `test:secret-hook` 4/4. |
| `node scripts/verify-foundation.mjs` exits 0 on the repo | VERIFIED | 14 of 14 pass, exit 0, two WARN lines for the owner tokens. |
| Backend `build` produces `dist/server.js`; frontend `build` succeeds | VERIFIED | `dist/server.js` 10282 bytes; `next build` exit 0 (Turbopack, 3 static pages). |

### Deferred Items

None. Later phases (2-8) do not cover any unmet Phase 1 item. SEC-05 is correctly mapped to Phase 2 and is not a Phase 1 requirement (helmet and a CORS allow-list already exist as extra).

### Required Artifacts

All artifacts listed in the ten plans exist and are substantive (not stubs); I read the controller, service, routes, app, error handler, env modules, store, slice, component, http client, all five workflows, dependabot.yml, compose.yaml, commitlint and husky files. Orphan check: every feature file is imported by the chain `page.tsx` -> `health-status.tsx` -> `health.slice.ts` -> `health.api.ts` -> `http.ts`; `v1Router` mounts `healthRouter` and `/openapi.json`.

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `page.tsx` | `health-status.tsx` | renders `<HealthStatus />` | WIRED | read |
| `health-status.tsx` | `health.slice.ts` | `useAppDispatch` + `fetchHealth` + `selectHealth` | WIRED | read, tests pass |
| `health.api.ts` | backend `/api/v1/health` | shared axios `http.get("/health")` | WIRED | live API answered; CORS ok |
| `health.service.ts` | `lib/prisma.ts` | `$queryRaw SELECT now()` | WIRED | live DB timestamp returned |
| `app.ts` | `error-handler.ts` | `notFound` then `errorHandler` after routes | WIRED | live 404 envelope |
| `next.config.ts` | `src/env.ts` | side-effect import | WIRED | build failed by name with bad URL |
| `.husky/commit-msg` | `commitlint.config.mjs` | `pnpm exec commitlint --edit` | WIRED | ran the hook directly |
| `.husky/pre-commit` | `scan-staged-secrets.sh` | second hook step | WIRED | script and its test run |
| `frontend api:types` | `backend/openapi/openapi.json` | openapi-typescript | WIRED | regenerated, no diff |
| `ci.yml` scripts | app `package.json` scripts | `pnpm lint/format:check/typecheck/test/build` | WIRED | scripts exist; each ran locally |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `health-status.tsx` | `data.database.serverTime` | store <- `fetchHealth` <- axios <- API <- Prisma `SELECT now()` | Yes (live timestamp from PostgreSQL) | FLOWING (API and store verified separately; browser render is a human item) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Backend check | `npx pnpm@11.28.5 --dir backend check` | exit 0 | PASS |
| Frontend check (committed tree) | eslint + `tsc --noEmit` + prettier ignoring the generated file | exit 0 / 0 / 0 | PASS |
| Frontend check (as shipped, after a host build) | `npx pnpm@11.28.5 --dir frontend check` | exit 1, `next-env.d.ts` | FAIL (W1) |
| Backend tests, real PostgreSQL | `pnpm --dir backend test` (`DATABASE_URL` on port 5440) | 4 files, 36 tests passed | PASS |
| Frontend tests | `pnpm --dir frontend test` | 4 files, 19 tests passed | PASS |
| Backend build | `pnpm --dir backend build` | `dist/server.js` written | PASS |
| Frontend build | `next build` with a valid URL | exit 0 | PASS |
| Env fail-fast (API) | `DATABASE_URL` unset / `notaurl` | names variable, exit 1 / 1 | PASS |
| Env fail-fast (web) | `NEXT_PUBLIC_API_URL=notaurl next build` | names variable, exit 1 | PASS |
| Commit standard | `test:commitlint`; `.husky/commit-msg` with bad, AI, good messages | 19/19; exit 1, 1, 0 | PASS |
| Secret hook | `test:secret-hook` | 4/4 | PASS |
| Foundation verifier | `node scripts/verify-foundation.mjs` | 14/14, exit 0 | PASS |
| Audit gate | `pnpm audit --audit-level=high` x3 | exit 0 each (frontend after one transient host crash) | PASS |
| Live stack | `docker compose up -d --wait`, curl health, 404, openapi, CORS | healthy; 200; envelope; 3.1.0; origin allow-list | PASS |
| Hot reload on host edit | not run (would modify source) | polling is configured (`CHOKIDAR_USEPOLLING`, `WATCHPACK_POLLING`) | SKIP |

The stack was stopped with `docker compose down` (no `-v`); no other container was touched.

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes exist and none is declared by a plan. SKIPPED.

### Requirements Coverage

Requirement IDs declared across the ten plans cover all 19 IDs in the roadmap for Phase 1. None are orphaned; REQUIREMENTS.md maps no additional ID to Phase 1.

| Requirement | Source Plan(s) | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| FND-01 | 01, 02, 03, 09 | Separate `frontend/`, `backend/`, `mobile/` | SATISFIED | folders present; `mobile/` README only |
| FND-02 | 08, 09 | Written standards document | SATISFIED | `docs/standards/*` |
| FND-03 | 04, 06 | One lint/format/strict-TS command per app | SATISFIED (W1) | backend passes; frontend passes on committed tree, fails after a Windows host build |
| FND-04 | 02, 03, 09 | Start full stack following the README | SATISFIED | compose stack converged healthy; README Quick start read |
| FND-05 | 03, 06, 07, 09 | Redux store, typed hooks, documented slice pattern | SATISFIED | `store/*`, `docs/standards/frontend.md`, lint rules proven |
| FND-06 | 02, 04, 05, 09 | Layered backend, central errors, validation | SATISFIED | layering lint rules proven; error handler tests |
| FND-07 | 05, 07 | Versioned, documented (OpenAPI) API | SATISFIED | `/api/v1`, `openapi.json` 3.1.0, no drift |
| FND-08 | 02, 04, 06 | Env validated at startup, `.env.example` | SATISFIED | fail-fast proven in both apps |
| CTB-01 | 09 | CONTRIBUTING, CODE_OF_CONDUCT, Apache-2.0 LICENSE | SATISFIED | files present (contact token pending) |
| CTB-02 | 10 | PR and issue templates | SATISFIED | `.github/PULL_REQUEST_TEMPLATE.md`, issue forms |
| CTB-03 | 08 | Commit standard documented, no AI trailers | SATISFIED | `docs/standards/commits.md`, 61 conforming commits |
| CTB-04 | 08 | Local hook rejects bad messages | SATISFIED | hook run directly, 19/19 fixtures |
| CTB-05 | 09, 10 | Branch and PR rules documented | SATISFIED (documentation); enforcement NEEDS HUMAN | CONTRIBUTING and `github-settings.md`; settings not applied |
| CI-01 | 10 | Actions run lint, type-check, test, build for both apps | NEEDS HUMAN | workflow correct and commands pass; never run on GitHub |
| CI-02 | 10 | PR title/commits checked in CI | NEEDS HUMAN | `pr-title.yml` correct; same commitlint config proven locally; never run |
| SEC-01 | 10 | Dependabot alerts and update PRs | NEEDS HUMAN | `dependabot.yml` valid and complete; alerts need repo settings |
| SEC-02 | 10 | CodeQL on PRs and on a schedule | NEEDS HUMAN | `codeql.yml` has all three triggers; never run |
| SEC-03 | 08, 10 | Secret scanning blocks committed credentials | SATISFIED locally; push protection NEEDS HUMAN | hook proven; CI `secrets.yml` read |
| SEC-04 | 10 | SECURITY.md | SATISFIED (fallback contact is an owner token) | file present with reporting steps |

### Prohibitions (judgment tier, non-authoritative)

All eight `must_haves.prohibitions` are judgment-tier. These are LLM-judge verdicts, not proof. Each carries the flag `unverified-prohibition: human review recommended`.

| Prohibition (plan) | Verdict | Basis |
| --- | --- | --- |
| Compose dev credentials not presented as production (02) | Held | `compose.yaml` and `.env.example` both label them development-only |
| No third-party telemetry from the default stack (03) | Held | `NEXT_TELEMETRY_DISABLED: "1"` in compose; no analytics script in the served HTML. Note: the build-time Google font fetch is an outbound call, already raised to the owner |
| Secret scan never silently skipped (08) | Held | `test:secret-hook` cases 3 and 4 fail closed |
| No documented or scripted hook bypass (08) | Held | `git grep` for `no-verify`, `HUSKY=0`, `HUSKY_SKIP` finds nothing outside planning files |
| No personal email in public files (09) | Held | `git grep` for addresses finds only a fixture `someone@example.com`; no developer address anywhere |
| Apache-2.0 text and Covenant not altered (09) | Held, partly checked | LICENSE size equals the canonical file; Covenant carries one replaced token and a retained official NOTE. I did not diff against the upstream download |
| No personal email in SECURITY.md or issue links (10) | Held | SECURITY.md fallback is the owner token |
| No advisory security check, no undated audit ignore (10) | Held | no `continue-on-error` in `.github`; the one ignore is a dated row in `docs/standards/security.md` |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `frontend/.prettierignore` | n/a | W1: `next-env.d.ts` is excluded from ESLint (`eslint.config.mjs` line 31) and from `tsconfig` handling, but not from Prettier. On Windows, any host-side `next build` or `next dev` rewrites that gitignored file with CRLF (reproduced: my `next build` at 18:27 regenerated it as CRLF), and Prettier's `endOfLine: "lf"` then fails `pnpm --dir frontend check`. The README and CONTRIBUTING both tell contributors to run `build` and `check` on the host. | Warning | Linux, macOS, CI and Docker are unaffected, and the committed tree passes. Windows contributors hit a confusing format failure on a generated file. One-line fix: add `next-env.d.ts` to `frontend/.prettierignore`. Plan 01-06 only tested `check` with the file absent. |
| `backend/eslint.config.mjs` | 60 | The controller no-Prisma pattern is extensionless (`**/lib/prisma`), so `../../lib/prisma.js` would not be caught. Not reachable today because the codebase imports extensionless. | Info | Cheap hardening: add `**/lib/prisma.*` |
| `compose.yaml` / `docs/standards/github-settings.md` | n/a | Owner placeholders `[OWNER TO SET: ...]` in SECURITY.md and CODE_OF_CONDUCT.md; second bracketed NOTE in the Covenant | Info | Tracked as human items; verify-foundation prints WARN |
| `.planning/config.json`, `.gsd/`, `.planning/milestone.lock`, `.claude/worktrees/` | n/a | Uncommitted or untracked orchestrator leftovers | Info | Not phase deliverables |

Debt-marker gate: no `TBD`, `FIXME` or `XXX` in any phase file. No stubs found in the walking-skeleton chain.

### Human Verification Required

See the `human_verification` and `behavior_unverified_items` blocks in the frontmatter. In short: (1) browser look at the home page and Refresh, (2) push to GitHub and run the first-push checklist (CI, pr-title, CodeQL, Dependabot, push protection, branch protection), (3) the six backstop truths, (4) fill the two owner contact tokens, (5) apply the repository settings, (6) decide the font and Vite warning items.

### Gaps Summary

No must-have failed, so there are no blocking gaps. The foundation is real: the stack runs, the skeleton is wired end to end against real PostgreSQL, standards are enforced by machine (lint layering rules, commit hook, secret hook, env fail-fast, drift checks) rather than only documented, and the 14-check verifier is green.

What keeps this from `passed`:

1. Everything that runs on GitHub is unobserved because no remote exists. The workflows and configuration are correct on inspection and every command they invoke passes here, but CI-01, CI-02, SEC-01 and SEC-02 are not demonstrated until the first push. The action versions they pin (checkout@v7, setup-node@v7, and others) could not be validated from here.
2. One reproducible, Windows-only defect (W1) breaks `pnpm --dir frontend check` after a host-side Next run. It is a Warning, not a goal failure. The owner is on Windows, so fixing it before Phase 2 is recommended; it is a one-line `.prettierignore` change.
3. Six backstop truths and the owner-input tokens need a human decision, and SEC-04's fallback contact is still a placeholder.

---

_Verified: 2026-10-08T12:59:00Z_
_Verifier: Claude (gsd-verifier)_
