# Phase 1: Repository Foundation & Standards - Research

**Researched:** 2026-10-08
**Domain:** Greenfield TypeScript repo foundation: Next.js 16 + Redux Toolkit frontend, Express 5 + Prisma 7 + Zod/OpenAPI backend, Docker Compose dev stack, commit/lint/CI/security tooling, on Windows 11 + Linux CI
**Confidence:** HIGH for the verified toolchain (most combinations were installed and run in a scratch directory this session); MEDIUM for GitHub-side behaviour (no remote exists, so nothing could be run against GitHub)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Workspace & local setup**
- **D-01:** Package manager is pnpm for both apps; contributors enable it through corepack.
- **D-02:** `frontend/` and `backend/` are independent apps, each with its own `package.json` and lockfile. No shared workspace package. The frontend does not import backend code; shared API types come from the generated OpenAPI document.
- **D-03:** One Docker Compose command starts everything for local development: PostgreSQL, the API and the web app all run in containers. The README's "start the full stack" path is this single command. Hot reload must still work inside the containers (source mounted as volumes).
- **D-04:** Node.js is pinned to the current active LTS only (`.nvmrc`, `engines`, CI and the Docker images all use the same version). No multi-version CI matrix.

**Frontend structure & Redux**
- **D-05:** Frontend code is organised by feature: `src/features/<feature>/` holds that feature's components, slice, API calls and types. Cross-feature code lives in shared folders (e.g. `src/components`, `src/lib`, `src/store`). (Reversibility: costly)
- **D-06:** API calls go through Redux Toolkit `createAsyncThunk` with a single shared axios instance. RTK Query is NOT used. Each feature slice handles loading / success / error state explicitly, following one documented pattern, and components use only the typed `useAppDispatch` / `useAppSelector` hooks. (Reversibility: costly)
- **D-07:** Next.js App Router (`app/` directory). Route files stay thin and delegate to feature folders.
- **D-08:** Styling standard is Tailwind CSS with shadcn/ui. Phase 1 only installs and configures it and uses it for the skeleton status page; the shared component set is built in Phase 2.

**Backend structure & API**
- **D-09:** Backend code is organised by module: `src/modules/<module>/` holds `<module>.routes`, `<module>.controller`, `<module>.service`, `<module>.schema` and its tests. The layering inside a module is routes -> controller -> service -> Prisma data access. Mirrors the frontend feature folders. (Reversibility: costly)
- **D-10:** Requests are validated with Zod schemas, and the OpenAPI document is generated from those same schemas so documentation cannot drift from the code. The API serves the versioned OpenAPI document.
- **D-11:** Every API response uses an envelope. Success: `{ data, meta }`. Error: `{ error: { code, message, details } }`. List paging information goes in `meta`. (Reversibility: costly)
- **D-12:** Every error carries a stable, documented error code (e.g. `VALIDATION_FAILED`, `NOT_FOUND`) alongside its message. Clients switch on the code. The list of codes is part of the written standards.
- **D-13:** Vitest is the test runner on both sides: backend with supertest against a real test database, frontend with Testing Library. Phase 1 ships a sample test for the skeleton on each side so CI's test step is real.

**Commit, branch & CI rules**
- **D-14:** Commit format is `type: subject`, e.g. `feat: add lead list`. Allowed types: feat, fix, docs, style, refactor, test, chore, ci, build, perf. Lowercase subject, maximum 72 characters, no body required, scope optional. A local commit hook rejects anything else.
- **D-15:** Commits and pull requests must never contain `Co-Authored-By` or any other AI attribution trailer. Messages stay short.
- **D-16:** Branch model is `main` plus short-lived branches named `feat/...`, `fix/...`, `docs/...`. Pull requests are squash-merged, so `main` gets one commit per PR, and the PR title must follow the commit format (checked in CI).
- **D-17:** Lint is strict with zero warnings allowed: ESLint recommended plus TypeScript strict rules, Prettier formatting, enforced import ordering, no `any`. Warnings fail CI. Staged files are auto-fixed before commit.
- **D-18:** A pull request can merge only when all checks pass (lint, type-check, test and build for the changed app, PR title format, CodeQL, dependency review) and it has one approving review. This is documented as the branch protection rule for `main`.

**Standards docs & naming**
- **D-19:** Written standards live in a `docs/` folder: `docs/standards/` with short files (structure, frontend, backend, commits, testing) and `docs/decisions/` for one-page architecture decision records. README and CONTRIBUTING link to them.
- **D-20:** All files are named in kebab-case (`lead-list.tsx`, `leads.service.ts`). React components are PascalCase only as identifiers, not as file names.

**Errors & logging**
- **D-21:** The API logs structured JSON with pino: JSON in production, pretty output in development, one line per request, with a request ID that is also returned in the response.

**Security scanning**
- **D-22:** Dependabot opens one grouped update pull request per app per week for routine updates; security fixes open immediately on their own.
- **D-23:** Secrets are caught in three places: gitleaks in the pre-commit hook, gitleaks again in CI, and GitHub secret scanning with push protection.
- **D-24:** CI fails a pull request that adds or keeps a high or critical dependency vulnerability. Moderate and low are reported but do not block.

**Environment & secrets**
- **D-25:** Environment variables are per app: `frontend/.env` and `backend/.env`, each with a committed `.env.example`. Each app validates its variables with a Zod schema at startup, names the missing or invalid variable, and exits. Docker Compose reads the same files. Real `.env` files are never committed.

### Claude's Discretion
- Exact tool choices not named above: the commit-hook tooling (e.g. husky + commitlint + lint-staged), the Zod-to-OpenAPI library, the HTTP security middleware, the ESLint config packages.
- Exact names and count of the files inside `docs/standards/`, and which Phase 1 choices get an ADR in `docs/decisions/`.
- Contents of the reserved `mobile/` folder (a README placeholder is enough).
- How the frontend derives types from the OpenAPI document (generation tool and where the output lives).
- Issue and pull request template wording, CODE_OF_CONDUCT source text.
- CodeQL schedule timing and Dependabot day of week.
- How the test database is provisioned for backend tests locally and in CI.

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-01 | Separate top-level `frontend/`, `backend/`, `mobile/` folders with conventional structure | Recommended Project Structure; `mobile/README.md` placeholder |
| FND-02 | Written standards document (structure, naming, conventions) | `docs/standards/*` file list; patterns in Architecture Patterns are the content source |
| FND-03 | Lint, format, strict TS check: one command per app, fail on violation | Verified ESLint 10 flat config + typescript-eslint strictTypeChecked + Prettier + `tsc --noEmit`; `pnpm check` script |
| FND-04 | Start full stack locally by following README | Compose design (env_file layering, healthcheck ordering, polling for hot reload) verified on Docker Desktop/Windows |
| FND-05 | Redux store, typed hooks, documented slice/API-call pattern | RTK 2.13 + react-redux 9.3 `withTypes` hooks, per-request `makeStore`, thunk pattern |
| FND-06 | Backend layered structure, central error handling, request validation | Module layout, Express 5 async propagation, Zod `parse` in controller, error-handler mapping |
| FND-07 | Versioned, documented API (OpenAPI) shared by web and mobile | `@asteasolutions/zod-to-openapi` 9.1.0 registry -> committed `openapi.json` -> `openapi-typescript` |
| FND-08 | Env validated at startup and documented in `.env.example` | Zod env module per app; Next `next.config.ts` import trick verified; drift check script |
| CTB-01 | CONTRIBUTING, CODE_OF_CONDUCT, Apache-2.0 LICENSE | Contributor Covenant 3.0 (CC BY-SA 4.0), Apache text from apache.org |
| CTB-02 | PR and issue templates | `.github/` layout, YAML issue forms |
| CTB-03 | Commit standard documented | commitlint config verified; `docs/standards/commits.md` |
| CTB-04 | Bad commit rejected by local hook | husky 9 + commitlint 21 verified on this Windows machine incl. AI-trailer rule |
| CTB-05 | Branch/PR rules documented | Branch protection settings checklist (owner applies) |
| CI-01 | GitHub Actions lint/type-check/test/build both apps on push+PR | Workflow design; action versions verified against remote tags |
| CI-02 | PR titles/commits checked in CI | Reuse the same commitlint config in a `pr-title` workflow (injection-safe) |
| SEC-01 | Dependabot alerts and update PRs | `dependabot.yml` design with grouping + security separation |
| SEC-02 | CodeQL on PRs and schedule | Advanced-setup workflow with `javascript-typescript`, `build-mode: none` |
| SEC-03 | Secret scanning blocks committed credentials | gitleaks v8.30.1 hook + CI (Docker image) + GitHub push protection |
| SEC-04 | SECURITY.md | Private vulnerability reporting + fallback contact (owner input needed) |
</phase_requirements>

## Summary

The stack in the locked decisions is all current and installs cleanly together, but **"latest" is the wrong pin for four packages** and the planner must prescribe exact versions: `typescript` must stay on 6.0.x (7.0.2 is `latest` on npm but typescript-eslint 8.71.1 declares `typescript >=4.8.4 <6.1.0`), `prisma`/`@prisma/client` must be pinned to 7.10.0 (`prisma@latest` on npm is now the Prisma 8 **release candidate** 8.0.0-rc.21; Prisma's own docs call Prisma 7 "stable, production-ready"), `eslint` must be 10.12.0 (ESLint 9.x is flagged "no longer supported" by npm; eslint-config-next 16.4.0 works on ESLint 10 in a smoke test despite undeclared peer ranges), and Node must be 24 LTS (not the Node 25 installed on this machine). I built a scratch backend (Express 5 + Prisma 7 + Zod 4 + OpenAPI + pino stack, tsup build, supertest/Vitest against real Postgres 18) and a scratch frontend (Next 16.4 + TS 6 + Tailwind 4 + shadcn + Vitest 5/RTL), so these combinations are verified, not inferred.

The riskiest decision for the walking skeleton is D-03 (everything in Docker, hot reload on a Windows bind mount). Measured on this machine: **Next.js Turbopack dev does not pick up file edits through a Docker Desktop Windows bind mount even with `WATCHPACK_POLLING`**, whereas `next dev --webpack` with `WATCHPACK_POLLING=true` does (also verified on the `D:` drive), and `tsx watch` needs `CHOKIDAR_USEPOLLING=1`. The Compose dev containers must therefore run `next dev --webpack` and polling env vars. Second most important: **a fresh Prisma 7.10.0 + eslint-plugin-check-file install already carries 3 high-severity audit findings** (`deepmerge-ts`, `mysql2` via the Prisma CLI, `braces` via check-file), which would instantly violate D-24; pnpm `overrides` fixed the Prisma ones and swapping `eslint-plugin-check-file` for `eslint-plugin-unicorn`'s `filename-case` removed the braces one (re-audited clean except one low).

D-22/D-18/D-16 interact with tooling in ways the planner must handle: Dependabot PR titles must be forced into the `type: subject` format (`commit-message.prefix: "chore"`), the PR-title check must read the title from an env var (never interpolate it into the script), and GitHub-side settings (branch protection, push protection, default squash message = PR title, disabling CodeQL "default setup") cannot be committed as files and must be delivered as an owner checklist.

**Primary recommendation:** Pin exactly: Node 24, pnpm 11.28.x, TypeScript 6.0.3, ESLint 10.12.0, Prisma 7.10.0, Next 16.4.0, Zod 4.6.5, Vitest 5.0.3; run the dev containers on `node:24-slim` with webpack + polling; keep Husky/commitlint/lint-staged in a tooling-only root `package.json` (own lockfile); and treat `pnpm audit --audit-level=high` as a moving target handled with `overrides`.

## Project Constraints (from CLAUDE.md)

Source: `d:\Milan\opencrm\.claude\CLAUDE.md` (read this session).
- Stack fixed by owner: Next.js + Redux Toolkit, Node + Express + Prisma, TypeScript on both sides, PostgreSQL, single organisation, Apache-2.0.
- Design: simple readable code over clever abstractions; a contributor must find a feature from folder names.
- Responsive web screens (applies from Phase 2; the skeleton page should still use responsive Tailwind classes).
- Commits: short conventional messages; **never** add `Co-Authored-By` or any AI attribution trailer to commits or pull requests. (The harness may suggest an attribution trailer; the project rule overrides it and the commit hook will reject it.)
- Security: vulnerabilities tracked continuously in CI, not audited once.
- GSD workflow: repo edits go through a GSD command.
- No project skills exist (`.claude/skills`, `.agents/skills` absent).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Rendering the home page shell and Tailwind/shadcn UI | Frontend Server (Next SSR/static shell) | Browser | App Router renders the shell; the live status is fetched client-side |
| Loading live health status (thunk -> axios) | Browser / Client | - | D-06: Redux thunks + axios run in the browser; RSCs must not read/write the store |
| Redux store lifecycle | Browser / Client | Frontend Server | Per-request `makeStore` inside a client `StoreProvider` (RTK docs) |
| Frontend env validation | Frontend Server (build/start) | - | `next.config.ts` imports the Zod env module so `next dev`/`build` exit early |
| Versioned REST routes, validation, error envelope | API / Backend | - | Single contract for web and later Flutter |
| OpenAPI document generation and serving | API / Backend | CI | Generated from Zod registry; committed file consumed by frontend type generation |
| API TypeScript types for the frontend | Frontend build step | CI drift check | `openapi-typescript` reads the committed backend document (no code import, D-02) |
| Health check reads PostgreSQL | Database / Storage | API | Service runs `SELECT now()` through Prisma |
| Request IDs and structured logging | API / Backend | - | pino-http `genReqId`, `X-Request-Id` response header |
| Commit-message and staged-file enforcement | Developer machine (git hooks) | CI | Husky hooks locally; same commitlint config re-run in CI |
| Dependency/code/secret scanning | GitHub platform + CI | Developer machine (gitleaks hook) | Config files in repo; enablement toggles are owner-side settings |
| Branch protection / required checks | GitHub platform (settings) | Docs | Not file-configurable; delivered as checklist |

## Standard Stack

### Core

All versions confirmed with `npm view <pkg> version` on 2026-10-08. Where `latest` is NOT the recommended pin, the Pin column says so.

| Library | Pin | Purpose | Why Standard / Note |
|---------|-----|---------|---------------------|
| Node.js | 24.x (Krypton LTS, 24.21.0) | Runtime | Active LTS today [VERIFIED: nodejs.org/dist/index.json + nodejs/Release schedule.json]. See Open Question 1: Node 24 enters Maintenance 2026-10-20 and Node 26 becomes LTS 2026-10-28 |
| pnpm | 11.28.5 (via `packageManager`) | Package manager (D-01) | Works through corepack inside `node:24-slim` [VERIFIED: ran `corepack prepare pnpm@11.28.5` and `@12.10.1` in container]. pnpm 12.10.1 (Rust rewrite, GA 2026-08-26) is `latest` but 6 weeks old; 11.x chosen for maturity. Needs Node >=22.13 |
| next | 16.4.0 | Frontend framework (D-07) | Built clean with TypeScript 6.0.3 and Turbopack in scratch [VERIFIED: `next build`] |
| react / react-dom | 19.3.0 | UI | Next peer range `^19.0.0` |
| @reduxjs/toolkit | 2.13.0 | Store, slices, `createAsyncThunk` (D-06) | Official [CITED: redux.js.org/usage/nextjs] |
| react-redux | 9.3.0 | Provider + typed hooks via `.withTypes` | [CITED: redux.js.org/usage/nextjs] |
| axios | 1.20.0 | Single shared HTTP client (D-06) | Locked by D-06 |
| tailwindcss + @tailwindcss/postcss | 4.3.3 | Styling (D-08) | shadcn init requires Tailwind installed first (see Pitfall 9) |
| shadcn (CLI) | 4.21.4 | Component scaffolding (D-08) | `init -y -b radix -p nova -t next` works non-interactively once Tailwind exists [VERIFIED: scratch run] |
| express | 5.2.1 | HTTP framework | Async handlers forward rejections; `req.query` is read-only [CITED: expressjs.com/en/guide/migrating-5.html] |
| prisma + @prisma/client + @prisma/adapter-pg + pg | **7.10.0** (all three exact) + pg 8.23.1 | ORM + Postgres driver adapter | **Do not use `prisma@latest`** (8.0.0-rc.21). Prisma docs: "Prisma ORM 7 is the stable... Prisma ORM 8 is still in release candidate" [CITED: prisma.io/docs/orm/release-status] |
| zod | 4.6.5 | Validation + env (D-10, D-25) | Peer of both OpenAPI libs |
| @asteasolutions/zod-to-openapi | 9.1.0 | Zod -> OpenAPI 3.1 (D-10) | 5.6M weekly downloads vs 1.7M for `zod-openapi`; registry pattern keeps docs next to routes. Generated a valid 3.1.0 doc in scratch [VERIFIED] |
| pino / pino-http / pino-pretty | 10.4.0 / 11.0.0 / 13.2.0 | Structured logging (D-21) | Named in D-21 (pino) |
| helmet / cors | 8.3.0 / 2.8.6 (+ @types/cors) | Baseline HTTP security headers + CORS allow-list | `@types/cors` is required or `tsc` fails TS7016 [VERIFIED: scratch tsc error] |
| typescript | **6.0.3** (`~6.0.3`) | Both apps | `latest` is 7.0.2 but typescript-eslint 8.71.1 peer is `>=4.8.4 <6.1.0` [VERIFIED: npm view] |
| eslint + @eslint/js | **10.12.0** / 10.0.1 | Linting (D-17) | ESLint 9.39.5 install printed "deprecated: This version is no longer supported" [VERIFIED: npm view eslint@9.39.5 deprecated] |
| typescript-eslint | 8.71.1 | `strictTypeChecked` config, `no-explicit-any` | Peer supports eslint ^10 |
| eslint-config-next | 16.4.0 | Next/React/a11y rules (frontend) | Ran on ESLint 10.12.0; rules execute (caught `react/jsx-key`); pnpm prints unmet-peer notices for eslint-plugin-react/jsx-a11y/import (they list eslint <=9) [VERIFIED: scratch] |
| eslint-plugin-simple-import-sort | 14.0.0 | Enforced import ordering (D-17) | Zero config, no resolver; flagged unsorted imports in scratch [VERIFIED] |
| eslint-plugin-unicorn | 77.0.0 | Only `unicorn/filename-case` (kebab-case, D-20) | Peer `eslint >=10.4`. Handles `[id]` route directories (checks basename only) [VERIFIED: scratch] |
| eslint-config-prettier / prettier | 10.1.8 / 3.9.9 | Formatting (D-17) | |
| vitest | 5.0.3 | Tests both sides (D-13) | Peer `vite ^6.4 \|\| ^7 \|\| ^8`; `@types/node ^22 \|\| >=24` |
| supertest (+ @types/supertest) | 7.3.1 / 7.2.1 | Backend HTTP tests (D-13) | Named in D-13 |
| vite / @vitejs/plugin-react / jsdom | 8.3.3 / 6.1.2 / 30.1.2 | Frontend Vitest environment | plugin-react 6 peer requires `vite ^8`. Set `resolve: { tsconfigPaths: true }` for `@/` alias [VERIFIED: scratch run, 1 test passed] |
| @testing-library/react / jest-dom / user-event | 16.3.3 / 7.0.1 / 14.6.7 | Component tests (D-13) | |
| tsx / tsup | 4.23.15 / 8.5.1 | Backend dev runner / production bundle | ESM + `moduleResolution: bundler` needs no `.js` import suffixes; `tsup` bundle ran and validated env at start [VERIFIED] |
| husky / lint-staged / @commitlint/cli + config-conventional | 9.1.7 / 17.6.0 / 21.2.3 | Commit + staged-file hooks | Verified end-to-end in a scratch git repo on this Windows machine |
| openapi-typescript | 7.13.0 | Frontend types from OpenAPI | Generated `paths`/`components` types from the scratch document [VERIFIED] |
| gitleaks | v8.30.1 (Docker `ghcr.io/gitleaks/gitleaks:v8.30.1`) | Secret scanning in hook + CI | `git --staged` caught a planted GitHub PAT in 3.5s via Docker [VERIFIED] |
| postgres (Docker) | `postgres:18-alpine` | Dev + CI database | `postgres:18-alpine` manifest exists. PG 18 images keep data under `/var/lib/postgresql` (mount the volume there, not `.../data`) [ASSUMED: Docker Hub image notes; the scratch run mounted `/var/lib/postgresql` and worked] |

### Supporting (shadcn init adds these itself)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| radix-ui, class-variance-authority, lucide-react, tw-animate-css, `cn`, `shadcn` (runtime CSS import) | as installed by `shadcn@4.21.4 init` (radix ^1.7.0, lucide-react ^1.52.0, tw-animate-css ^1.4.0, cn ^0.4.0) | shadcn base | Installed by the CLI. `cn` is the shadcn-maintained replacement for clsx+tailwind-merge (repo `shadcn-ui/cn`, maintainer shadcn) [VERIFIED: npm view cn] |
| @types/node 24, @types/react 19, @types/express 5.0.6, @types/pg | latest 24.x / 19.x | Types | Pin `@types/node` to the 24 line to match runtime (npm `latest` is 26.6.4) |
| globals | 17.13.0 | ESLint globals if needed | |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @asteasolutions/zod-to-openapi | `zod-openapi` 6.0.2 | No `extendZodWithOpenApi` monkey-patch, uses Zod 4 `.meta()`; 3x fewer downloads. Either works with Zod 4; chosen one has the registry that sits beside routes |
| ESLint 10.12.0 | ESLint 9.39.5 | Zero peer notices but npm-deprecated/unsupported |
| TypeScript 6.0.3 | TypeScript 7.0.2 | Faster native compiler, but typescript-eslint cannot lint against it yet |
| pnpm 11.28.5 | pnpm 12.10.1 | 12 is newer Rust rewrite with the same lockfile/settings; both work in corepack. Dependabot's pnpm 11/12 lockfile support is not documented (see A6) |
| `eslint-plugin-check-file` | `unicorn/filename-case` | check-file pulls `micromatch>braces` (high advisory, no patch) |
| Compose `develop.watch` (sync) | bind mounts + polling | Watch needs no polling but conflicts with D-03's "source mounted as volumes" wording |
| node:24-slim (Debian) | node:24-alpine | Slim = glibc, fewer native-binding surprises (Tailwind oxide, rolldown); Prisma 7 migrate worked on slim without extra packages [VERIFIED] |
| husky + lint-staged | lefthook | lefthook is a Go binary with no Node dependency but D-14/D-17 discretion examples name husky; no reason to deviate |

**Installation (per app, exact pins; run inside the app folder):**
```bash
# backend/
pnpm add express@5.2.1 zod@4.6.5 @asteasolutions/zod-to-openapi@9.1.0 pino@10.4.0 pino-http@11.0.0 helmet@8.3.0 cors@2.8.6 @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 pg@8.23.1
pnpm add -D prisma@7.10.0 typescript@6.0.3 tsx@4.23.15 tsup@8.5.1 vitest@5.0.3 supertest@7.3.1 pino-pretty@13.2.0 @types/express@5.0.6 @types/cors @types/supertest @types/pg @types/node@24 eslint@10.12.0 @eslint/js@10.0.1 typescript-eslint@8.71.1 eslint-plugin-simple-import-sort@14.0.0 eslint-plugin-unicorn@77.0.0 eslint-config-prettier@10.1.8 prettier@3.9.9
# frontend/
pnpm add next@16.4.0 react@19.3.0 react-dom@19.3.0 @reduxjs/toolkit@2.13.0 react-redux@9.3.0 axios@1.20.0 zod@4.6.5 tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 postcss
pnpm add -D typescript@6.0.3 @types/node@24 @types/react@19 eslint@10.12.0 eslint-config-next@16.4.0 typescript-eslint@8.71.1 eslint-plugin-simple-import-sort@14.0.0 eslint-plugin-unicorn@77.0.0 eslint-config-prettier@10.1.8 prettier@3.9.9 vitest@5.0.3 vite@8.3.3 @vitejs/plugin-react@6.1.2 jsdom@30.1.2 @testing-library/react@16.3.3 @testing-library/jest-dom@7.0.1 @testing-library/user-event@14.6.7 openapi-typescript@7.13.0
# then (after Tailwind + globals.css exist): pnpm dlx shadcn@4.21.4 init -y -b radix -p nova -t next --no-monorepo
# repo root (tooling only)
pnpm add -D husky@9.1.7 lint-staged@17.6.0 @commitlint/cli@21.2.3 @commitlint/config-conventional@21.2.3
```

**pnpm 11 behaviours the planner must encode in each app's `pnpm-workspace.yaml`** (settings no longer live in `.npmrc`):
- `allowBuilds` is required: `pnpm add` of `eslint-config-next` ended with `ERR_PNPM_IGNORED_BUILDS: unrs-resolver` until it was listed. Backend needs `"@prisma/engines": true`, `prisma: true`, `esbuild: true`; frontend needs `unrs-resolver: true` (and `sharp: true` if image optimisation is used). [VERIFIED: scratch installs]
- `overrides` (see Pitfall 3).
- `minimumReleaseAge` defaults to 1 day and breaks Dependabot lockfile PRs on fresh transitive releases; add `minimumReleaseAgeExclude` entries as they occur or set a cooldown [CITED: dev.classmethod.jp/en/articles/pnpm-11-minimum-release-age-dependabot-ci-failure/].
- `pnpm dlx shadcn init` appended `minimumReleaseAgeExclude` entries to `pnpm-workspace.yaml` as a side effect [VERIFIED: scratch output]; review the diff after running it.

## Package Legitimacy Audit

Run via `node ~/.claude/gsd-core/bin/gsd-tools.cjs query package-legitimacy check --ecosystem npm ...` on 2026-10-08. No package showed a `postinstall` script in the seam signals; the only lifecycle scripts seen at install were `prisma` preinstall (banner), `@prisma/engines`, `esbuild`, `unrs-resolver` postinstall/`sharp` (all handled through `allowBuilds`).

**How to read the SUS verdicts:** every SUS has exactly one reason, `too-new`, computed from the **latest release's publish date** (`publishedAt` within days: e.g. `next` 2026-10-06 with 76.9M weekly downloads). These are long-established packages with the source repos shown. They are not hallucinated or newly created packages. Because the planner protocol requires a `checkpoint:human-verify` before installing SUS packages, **add one checkpoint per app dependency manifest (frontend, backend, root tooling) that reviews the exact pinned list and lockfile diff before the first `pnpm install`, rather than one per package.** Pinning exact versions plus pnpm's 1-day `minimumReleaseAge` is the mitigation.

| Package | Registry | Weekly downloads | Source Repo | Verdict | Disposition |
|---------|----------|------------------|-------------|---------|-------------|
| react-redux, axios, tailwindcss, @tailwindcss/postcss, class-variance-authority, tw-animate-css, express, cors, helmet, pino-http, @prisma/client, @prisma/adapter-pg, @asteasolutions/zod-to-openapi, tsup, typescript, @types/supertest, @types/express, @types/cors, @types/pg, @eslint/js, eslint-config-prettier, eslint-plugin-simple-import-sort, husky, openapi-typescript, @testing-library/react, jest-dom, user-event | npm | 5.6M - 365M | all have real GitHub repos | OK | Approved |
| next (76.9M), react (224M), react-dom (212M), @reduxjs/toolkit (38M), zod (387M), shadcn (13.4M), cn (8.9M, repo shadcn-ui/cn), radix-ui (19M), lucide-react (135M), pino (63M), pino-pretty (30M), prisma (22M), pg (73M), tsx (115M), vitest (142M), supertest (22.6M), @types/node (549M), @types/react (205M), eslint (198M), typescript-eslint (113M), eslint-config-next (42M), eslint-plugin-unicorn (9M), prettier (169M), lint-staged (36M), @commitlint/cli + config-conventional (13M), vite (232M), @vitejs/plugin-react (117M), jsdom (132M), globals (327M) | npm | see left | all have real GitHub repos | SUS (`too-new` only) | Flagged - single manifest-level `checkpoint:human-verify` before install |
| (none) | - | - | - | SLOP | No package was removed |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** listed in the second row above; handled by the manifest-level checkpoint.
**Package-name provenance:** names that come from CONTEXT.md/official docs (next, react, RTK, react-redux, axios, express, prisma, zod, pino, supertest, vitest, husky, commitlint, lint-staged, Tailwind, shadcn) are doc-sourced. Names that came from my own knowledge and were only confirmed by registry + the seam (`@asteasolutions/zod-to-openapi`, `eslint-plugin-simple-import-sort`, `eslint-plugin-unicorn`, `openapi-typescript`, `tsx`, `tsup`, `pino-http`, `helmet`, `cors`) are `[ASSUMED]` per the provenance rule (A3); the manifest checkpoint covers them.

**Day-one `pnpm audit` result (this matters for D-24):** a fresh backend install (Prisma 7.10.0 + tsup + check-file) reported `5 vulnerabilities (1 low | 1 moderate | 3 high)`: `deepmerge-ts <8.0.0` (GHSA-ggr8-5vv4-36mx) and `mysql2 <3.22.0` (GHSA-3f6p-5ww8-9rcr) both via `prisma` -> `@prisma/config`/`mysql2`; `braces <=3.0.3` (GHSA-vfj7-8cjw-p6xm, **no patched version**) via `eslint-plugin-check-file>micromatch`; `esbuild <0.28.1` (low) via tsup. After adding `overrides: { deepmerge-ts: ">=8.0.0", mysql2: ">=3.23.1" }` and replacing check-file with unicorn, `pnpm audit --audit-level=high` reported only 1 low, `pnpm audit --prod` reported none, and `prisma generate` / `migrate status` still worked. [VERIFIED: scratch runs]

## Architecture Patterns

### System Architecture Diagram

```
 Developer machine (Windows/Linux)                         GitHub
 ┌────────────────────────────────────────────┐      ┌──────────────────────────────┐
 │ git commit                                  │      │ push / pull_request          │
 │   ├─ pre-commit: lint-staged (eslint --fix, │      │   ├─ ci.yml: frontend job    │
 │   │   prettier) + gitleaks --staged         │ ───► │   ├─ ci.yml: backend job     │
 │   └─ commit-msg: commitlint (type: subject, │      │   │     (+postgres service)  │
 │       no AI trailer)                        │      │   ├─ pr-title.yml (commitlint│
 └────────────────────────────────────────────┘      │   │     on title + commits)  │
                                                       │   ├─ codeql.yml (PR+weekly)  │
 docker compose up   (single command, D-03)           │   ├─ secrets.yml (gitleaks)  │
 ┌──────────────────────────────────────────────────┐ │   ├─ audit.yml (pnpm audit   │
 │  ┌────────┐   ┌───────────────┐   ┌────────────┐ │ │   │   high + dep-review)     │
 │  │  db    │◄──│  api          │◄──│  web       │ │ │   └─ dependabot.yml          │
 │  │ PG 18  │   │ Express 5     │   │ Next 16    │ │ └──────────────────────────────┘
 │  │ healthy│   │ :4000         │   │ :3000      │ │
 │  └────────┘   └──────┬────────┘   └─────┬──────┘ │
 └─────────────────────┼───────────────────┼────────┘
                       │                   │ serves shell + JS bundle
 Browser ──────────────┼───────────────────┘
   page.tsx ─► features/health (component)
        │ dispatch(fetchHealth())
        ▼
   health slice thunk ─► shared axios instance ──HTTP (CORS)──► GET /api/v1/health
                                                                     │
        request-id + pino-http ─► helmet ─► cors ─► json ─► router   │
        routes ─► controller ─► service ─► Prisma (adapter-pg) ─► SELECT now()
                                   │
                    success: { data, meta }   failure: { error: { code, message, details } }
        error-handler maps ZodError→VALIDATION_FAILED, AppError→its code,
        unknown route→NOT_FOUND, DB down→SERVICE_UNAVAILABLE, else INTERNAL_ERROR
   GET /api/v1/openapi.json  ◄── registry (zod-to-openapi) ◄── module schema + routes files
   backend/openapi/openapi.json (committed) ─► openapi-typescript ─► frontend/src/lib/api/schema.d.ts (committed)
```

### Recommended Project Structure
```
opencrm/
├── .editorconfig  .gitattributes  .gitignore  .nvmrc            # nvmrc = 24
├── package.json  pnpm-lock.yaml  pnpm-workspace.yaml            # TOOLING ONLY: husky, lint-staged, commitlint (not a workspace of the apps)
├── commitlint.config.mjs  lint-staged.config.mjs
├── .husky/{pre-commit,commit-msg}                                # LF endings enforced by .gitattributes
├── compose.yaml                                                  # db + api + web (dev)
├── README.md  LICENSE  CONTRIBUTING.md  CODE_OF_CONDUCT.md  SECURITY.md
├── .github/
│   ├── workflows/{ci.yml, pr-title.yml, codeql.yml, secrets.yml, audit.yml}
│   ├── dependabot.yml  PULL_REQUEST_TEMPLATE.md
│   └── ISSUE_TEMPLATE/{bug-report.yml, feature-request.yml, config.yml}
├── docs/
│   ├── standards/{structure.md, frontend.md, backend.md, commits.md, testing.md, github-settings.md}
│   └── decisions/{0001-...md}                                    # one-page ADRs
├── scripts/verify-foundation.mjs                                 # cross-platform repo checks (see Validation)
├── mobile/README.md                                              # reserved placeholder (FND-01)
├── frontend/
│   ├── package.json  pnpm-lock.yaml  pnpm-workspace.yaml  tsconfig.json  next.config.ts
│   ├── eslint.config.mjs  prettier.config.mjs  postcss.config.mjs  vitest.config.ts  vitest.setup.ts
│   ├── components.json  .env.example  Dockerfile
│   └── src/
│       ├── app/            # thin route files only: layout.tsx, page.tsx, providers
│       ├── features/health/  # health-status.tsx, health.slice.ts, health.api.ts, health.types.ts, *.test.tsx
│       ├── components/ui/  # shadcn output (lint-ignored)
│       ├── lib/            # api/http.ts (axios), api/schema.d.ts (generated), utils.ts
│       ├── store/          # index.ts (makeStore), hooks.ts, store-provider.tsx
│       └── env.ts
└── backend/
    ├── package.json  pnpm-lock.yaml  pnpm-workspace.yaml  tsconfig.json  tsup.config.ts
    ├── eslint.config.mjs  prettier.config.mjs  vitest.config.ts  prisma.config.ts
    ├── .env.example  Dockerfile  docker/dev-entrypoint.sh
    ├── prisma/{schema.prisma, migrations/}
    ├── openapi/openapi.json                    # committed, regenerated by script
    ├── scripts/generate-openapi.ts
    └── src/
        ├── server.ts  app.ts  env.ts  routes.ts
        ├── lib/{prisma.ts, logger.ts, openapi.ts, app-error.ts}
        ├── middleware/{error-handler.ts, not-found.ts}
        ├── modules/health/{health.routes.ts, health.controller.ts, health.service.ts, health.schema.ts, health.test.ts}
        └── generated/prisma/                   # gitignored, produced by `prisma generate`
```

### Pattern 1: Backend module (routes -> controller -> service -> Prisma)
**What:** Each module folder holds exactly the D-09 files. Routes register the Express route **and** the OpenAPI path in the same file; the controller parses input with Zod and shapes the envelope; the service owns Prisma access and business rules; the schema file holds Zod schemas (with `.openapi("Name")`).
**Rules to put in `docs/standards/backend.md`:** controllers never import Prisma; routes never import services; services never touch `req`/`res`; one `AppError(code, status, message, details?)` for expected failures. Enforce the first two with ESLint `no-restricted-imports` per file glob (config-only, no new dependency) [ASSUMED: rule works as described, not run].
**Express 5 specifics:** async handlers need no try/catch; `req.query` is a getter, so never assign to it. Validate with `schema.parse(req.query)` at the top of the controller (a `ZodError` is mapped centrally to `VALIDATION_FAILED`) instead of a middleware that mutates the request. [CITED: expressjs.com/en/guide/migrating-5.html]
**Example (health module; env, Prisma, registry and supertest test were run in scratch):**
```typescript
// health.schema.ts
import { z } from "../../lib/openapi";
export const healthSchema = z
  .object({ status: z.literal("ok"), database: z.object({ connected: z.boolean(), serverTime: z.string() }) })
  .openapi("Health");

// health.service.ts  (the only layer that touches Prisma)
import { prisma } from "../../lib/prisma";
export async function getHealth() {
  const rows = await prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
  return { status: "ok" as const, database: { connected: true, serverTime: rows[0].now.toISOString() } };
}

// health.controller.ts
import type { Request, Response } from "express";
import { getHealth } from "./health.service";
export async function getHealthHandler(_req: Request, res: Response) {
  res.json({ data: await getHealth(), meta: {} });
}
```
(Strict lint rejected `rows[0]!` as a non-null assertion; with `noUncheckedIndexedAccess` off, `rows[0].now` is accepted. Decide on `noUncheckedIndexedAccess` once and document it.)

### Pattern 2: Zod -> OpenAPI registry -> committed document -> frontend types
**What:** `lib/openapi.ts` exports one `OpenAPIRegistry`; each `*.routes.ts` calls `registry.registerPath(...)` beside its `router.get(...)`. `scripts/generate-openapi.ts` imports every routes file, builds the document with `OpenApiGeneratorV31`, writes `backend/openapi/openapi.json`. The API serves the same builder output at `GET /api/v1/openapi.json`. The frontend runs `openapi-typescript ../backend/openapi/openapi.json -o src/lib/api/schema.d.ts`. CI regenerates both and runs `git diff --exit-code` so drift fails the build. The shared success/error envelope is defined once as registry components (`ErrorResponse`, `ErrorCode` enum) and a small `envelope(schema)` helper.
**Verified:** scratch registry produced `openapi: 3.1.0` with `components.schemas.Health`; `openapi-typescript` 7.13.0 emitted `paths["/health"]` with `data`/`meta` typed. `extendZodWithOpenApi(z)` must be called once before any `.openapi()` use; keep it in `lib/openapi.ts` and import `z` only from there in schema files.
**Docs UI:** serve JSON only in Phase 1 (success criterion is "serves a versioned OpenAPI document"). A Swagger/Scalar UI conflicts with helmet's default CSP and is not needed yet.

### Pattern 3: Environment validation (both apps)
**What:** One `env.ts` per app with a Zod schema; on failure print one line per bad variable naming it, then `process.exit(1)`. Export the parsed object; everything else imports `env`, never `process.env`.
- Backend: `import "./env"` is the first import in `server.ts` (fails before any DB or HTTP work). Make the parse a pure `parseEnv(source)` function plus a top-level call so the failure message is unit-testable.
- Frontend: `next.config.ts` does `import "./src/env"`, so `next dev`/`next build` print `Invalid environment configuration: - NEXT_PUBLIC_API_URL: ...` and exit [VERIFIED: scratch `next build` without the variable]. **Client code only sees `NEXT_PUBLIC_*` values that are written literally** (`process.env.NEXT_PUBLIC_API_URL`), so build the object to parse from explicit property reads, never `process.env` as a whole.
- A drift check (in `scripts/verify-foundation.mjs`) asserts every key in each Zod schema appears in that app's `.env.example`.

### Pattern 4: Frontend slice + thunk (the one copyable pattern, D-06)
**What:** One file shape for every feature: `<feature>.types.ts` (response types derived from `schema.d.ts`), `<feature>.api.ts` (plain functions that call the shared axios instance and return the unwrapped `data`), `<feature>.slice.ts` (state + `createAsyncThunk` + extraReducers), component(s) that use only `useAppDispatch`/`useAppSelector`.
- State shape: `{ data: T | null, status: "idle" | "loading" | "succeeded" | "failed", error: ApiError | null }`.
- Thunk type string: `"<feature>/<verb>"` (e.g. `health/fetch`); thunk const named `fetchHealth`; use `createAsyncThunk.withTypes<{ rejectValue: ApiError }>()` [ASSUMED: `withTypes` on createAsyncThunk exists in RTK 2.x; confirm when writing].
- axios instance (`src/lib/api/http.ts`): `baseURL = env.NEXT_PUBLIC_API_URL`; a response interceptor converts any failure (HTTP error envelope, network error, timeout) into an `ApiError { code, message, details, requestId? }` so slices never inspect axios errors. Read `X-Request-Id` from response headers (requires `exposedHeaders` on the API's CORS config).
- Store: `makeStore()` factory (no global store), `StoreProvider` client component using `useState(makeStore)`, typed hooks via `useDispatch.withTypes<AppDispatch>()` / `useSelector.withTypes<RootState>()`; RSCs never read the store [CITED: redux.js.org/usage/nextjs].
- Enforce "only typed hooks" with an ESLint `no-restricted-imports` rule banning `useDispatch`/`useSelector` imports from `react-redux` outside `src/store/hooks.ts` [ASSUMED: not run].
- Pages stay thin: `src/app/page.tsx` renders `<HealthStatus />` from `src/features/health`.

### Pattern 5: Response envelope and error codes (D-11, D-12)
Success `{ data, meta }`; error `{ error: { code, message, details } }` (exactly these keys). Put the request id in the `X-Request-Id` response header only, so the envelope keys stay as locked. Proposed initial code list for `docs/standards/backend.md` (names beyond the two examples in D-12 are proposals, A4): `VALIDATION_FAILED` (400), `NOT_FOUND` (404), `SERVICE_UNAVAILABLE` (503, DB unreachable; this is the skeleton's demonstrable error path), `INTERNAL_ERROR` (500). Phase 2 adds `UNAUTHENTICATED`, `FORBIDDEN`, etc. The central error handler must also handle malformed JSON bodies (body-parser error -> `VALIDATION_FAILED`) and never leak stack traces in production.

### Pattern 6: Logging and request id (D-21)
`pino-http` with `genReqId` (accept a well-formed inbound `X-Request-Id`, otherwise `crypto.randomUUID()`), set the response header in the same hook, `pino-pretty` transport only when `NODE_ENV=development`, `redact` for `req.headers.authorization` and `req.headers.cookie`. One log line per request is pino-http's default. Add `exposedHeaders: ["X-Request-Id"]` to CORS.

### Pattern 7: Docker Compose dev stack (D-03, D-25) - measured on this machine
```yaml
# compose.yaml (shape; values to finalise in the plan)
name: opencrm
services:
  db:
    image: postgres:18-alpine
    environment: { POSTGRES_USER: opencrm, POSTGRES_PASSWORD: opencrm, POSTGRES_DB: opencrm }   # dev-only credentials
    ports: ["127.0.0.1:${DB_PORT:-5432}:5432"]
    volumes: ["db-data:/var/lib/postgresql"]                      # PG 18 layout
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U opencrm -d opencrm"], interval: 3s, timeout: 3s, retries: 20 }
  api:
    build: { context: ./backend, args: { NODE_VERSION: "24" } }
    env_file:
      - { path: backend/.env.example, required: true }          # zero-config first run
      - { path: backend/.env, required: false }                 # contributor overrides
    environment:
      DATABASE_URL: postgresql://opencrm:opencrm@db:5432/opencrm  # wins over env_file; .env.example keeps localhost for host runs
      CHOKIDAR_USEPOLLING: "1"                                    # tsx watch on Windows bind mounts
    ports: ["${API_PORT:-4000}:4000"]
    volumes: ["./backend:/app", "api-node-modules:/app/node_modules"]
    depends_on: { db: { condition: service_healthy } }
    healthcheck: { test: ["CMD-SHELL", "wget -qO- http://localhost:4000/api/v1/health >/dev/null || exit 1"] }
  web:
    build: { context: ./frontend, args: { NODE_VERSION: "24" } }
    env_file: [ { path: frontend/.env.example, required: true }, { path: frontend/.env, required: false } ]
    environment: { WATCHPACK_POLLING: "true" }
    command: pnpm exec next dev --webpack -H 0.0.0.0              # Turbopack does not see edits through the Windows bind mount
    ports: ["${WEB_PORT:-3000}:3000"]
    volumes: ["./frontend:/app", "web-node-modules:/app/node_modules", "web-next:/app/.next"]
    depends_on: { api: { condition: service_healthy } }
volumes: { db-data: {}, api-node-modules: {}, web-node-modules: {}, web-next: {} }
```
Verified facts: layered `env_file` (committed `.env.example` first, optional `.env` second, `environment:` last) resolves with later sources winning (`docker compose config` output: PORT 4000 -> 4999 when `.env` present, `DATABASE_URL` stayed the `environment:` value) [VERIFIED]; bind-mounted source hides anything baked into the image, so the entrypoint must run `pnpm install --frozen-lockfile`, `prisma generate`, `prisma migrate deploy` at container start (first start measured 71s for the backend install through the bind mount; warn in README) [VERIFIED]; `node:24-slim` ships corepack 0.36.0 [VERIFIED].
**Browser vs container URLs:** the browser calls `http://localhost:${API_PORT}/api/v1`, so `NEXT_PUBLIC_API_URL` is a localhost URL, not `http://api:4000`; CORS allow-list must contain `http://localhost:3000`.
**Host ports:** port 4000 was already taken on this machine (a different service answered `{"error":"Not found"}` while the scratch Express 5 server printed "listening"), and other Postgres containers exist, so every published port must be overridable (`${API_PORT:-4000}` etc.). In Express 5, `app.listen` passes listen errors to its callback, so the callback must check its error argument and exit non-zero [ASSUMED: inferred from observed behaviour + Express 5 changes; verify in the first task].

### Pattern 8: Commit, hook and CI wiring
- **Root tooling package.** husky 9 needs a `package.json` with `"prepare": "husky"` at the git root; pnpm's per-app lockfiles (D-02) cannot host it. Create a root `package.json` that is `private`, contains only husky, lint-staged and commitlint, has its own lockfile, and is **not** a workspace. This is a reading of D-02 ("no shared workspace package"); flag it in the plan (A1).
- **commitlint config (tested):** `@commitlint/config-conventional` + `type-enum` = the ten D-14 types, `header-max-length` 72, body/footer line limits off, plus a tiny inline plugin rule `no-ai-attribution` matching `co-authored-by:`, `generated with [claude`, `noreply@anthropic.com`. Verified rejections on this machine: `Added stuff` (type-empty), trailer commit, `feat: Add Thing`, 73-char header; `feat: add thing` passed.
- **Husky hooks:** `.husky/commit-msg` = `pnpm exec commitlint --edit "$1"` (verified); `.husky/pre-commit` = `pnpm exec lint-staged` then the gitleaks step.
- **lint-staged:** function-form config per app works (verified shape); run each app's tools from inside the app: `pnpm --dir frontend exec eslint --fix --max-warnings 0 <rel files>` then `pnpm --dir frontend exec prettier --write <rel files>` [ASSUMED for the exact commands]. This requires `frontend/node_modules` and `backend/node_modules` to exist on the host, which the all-in-Docker flow does not create. README must say: Docker alone runs the app; contributors who commit also run `pnpm install` at root and in each app (also needed for editor type information).
- **gitleaks hook:** prefer a local `gitleaks` binary if present (`gitleaks git --staged --redact --no-banner`), otherwise run `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W 2>/dev/null || pwd):/repo" -w /repo ghcr.io/gitleaks/gitleaks:v8.30.1 git --staged --redact --no-banner` (works under Git Bash on Windows; `MSYS_NO_PATHCONV=1` is required; verified detection of a planted GitHub PAT). Fail the commit with install instructions if neither exists; do not silently skip.
- **CI gitleaks:** run the same pinned Docker image (`git` subcommand over full history, `fetch-depth: 0`). Do **not** use `gitleaks/gitleaks-action` for an organisation-owned repo: it requires a `GITLEAKS_LICENSE` for organisation accounts [CITED: github.com/gitleaks/gitleaks-action]. The current owner account (`mma150`, per `gh auth status`) is personal, but the repo may move.
- **`ci.yml`:** two jobs named `frontend` and `backend` (stable names for required checks), always run on push and pull_request (CI-01 says both apps; path filtering plus required checks leaves skipped jobs "pending" forever, so do not path-filter in Phase 1). Per job: `actions/checkout@v7`, `pnpm/action-setup@v6` with `package_json_file: <app>/package.json`, `actions/setup-node@v7` with `node-version-file: .nvmrc` and `cache: pnpm` + `cache-dependency-path: <app>/pnpm-lock.yaml`, `pnpm install --frozen-lockfile`, then lint, `format:check`, `typecheck`, `test`, `build`, plus the OpenAPI drift step. Backend adds a `services: postgres:18-alpine` with health options and `DATABASE_URL` env. Top-level `permissions: contents: read`, `concurrency` cancel-in-progress. Action tags verified against the remote repos: checkout `v7`, setup-node `v7`, pnpm/action-setup `v6` (supports pnpm up to v12), codeql-action `v4`, dependency-review-action `v5` (a branch, README documents `@v5`), amannn/action-semantic-pull-request `v6` (not needed). Pinning actions by full SHA is stronger supply-chain hygiene; Dependabot's `github-actions` ecosystem maintains SHAs. Decide in the plan (A7).
- **`pr-title.yml`:** checkout, install **root** tooling, then `env: PR_TITLE: ${{ github.event.pull_request.title }}` and `printf '%s\n' "$PR_TITLE" | pnpm exec commitlint` (never put `${{ ... title }}` inside the `run:` body: script injection). Also lint the commit range `--from base.sha --to head.sha`. Skip or relax for `dependabot[bot]` (see Pitfall 8).
- **`audit.yml`:** `pnpm audit --audit-level=high` in each app (this is "adds **or keeps**" from D-24), `actions/dependency-review-action@v5` with `fail-on-severity: high` on pull requests, and a weekly `schedule` so a new advisory turns the default branch red without a code change. dependency-review works on public repos or private repos with GitHub Advanced Security [CITED: github.com/actions/dependency-review-action].
- **`codeql.yml`:** triggers `push` (main), `pull_request` (main), weekly `schedule`; matrix `language: javascript-typescript`, `build-mode: none`; `github/codeql-action/init@v4` and `analyze@v4`; permissions `security-events: write, contents: read, actions: read` [CITED: docs.github.com customizing advanced setup]. Adding the `actions` language to scan workflow files is optional [ASSUMED]. The repo's CodeQL "default setup" must stay off while this file exists.
- **`dependabot.yml`:** `npm` entries for `/`, `/frontend`, `/backend`; `github-actions` for `/`; `docker` for `/frontend` and `/backend`; `docker-compose` for `/`. Weekly. Per app, one group `routine` with `applies-to: version-updates`, `patterns: ["*"]`, `update-types: [minor, patch]`; major bumps arrive as separate PRs. Security updates are not grouped by that group, so they stay individual and immediate [CITED: docs.github.com dependabot-options-reference]. Set `commit-message: { prefix: "chore" }` so titles become `chore: bump ...`. Add an `ignore` for `typescript` major (TS 7 breaks typescript-eslint) [VERIFIED peer range].

### Anti-Patterns to Avoid
- **RTK Query or per-feature axios instances:** explicitly rejected by D-06.
- **A global Redux store variable:** shared across requests in Next SSR [CITED].
- **Assigning to `req.query` or middleware that rewrites it:** read-only in Express 5.
- **Interpolating `${{ github.event.pull_request.title }}` into a `run:` script:** injection; use an env var.
- **`prisma@latest` / `typescript@latest` / `eslint@latest` / `@types/node@latest`:** each is the wrong major today.
- **`env("DATABASE_URL")` in `prisma.config.ts`:** makes `prisma generate` fail whenever the variable is absent (CI lint/typecheck jobs, Docker image builds). Use `process.env.DATABASE_URL` [VERIFIED: with `env()` generate failed with `PrismaConfigEnvError`; with `process.env` generate succeeded and only `migrate deploy` complained].
- **Committing generated Prisma client:** keep `src/generated/prisma` gitignored and regenerate (`prisma generate`) in `postinstall`/entrypoint/CI.
- **Path-filtering required CI checks:** skipped jobs never report; use always-run jobs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Commit message linting | Regex in a shell hook | commitlint 21 + config-conventional + one custom rule | Same config is reused by the CI PR-title check; error messages are standard |
| Secret detection | Grep patterns | gitleaks v8.30.1 | Maintained ruleset, entropy checks, `--staged` mode |
| OpenAPI document | Hand-written YAML/JSON | `@asteasolutions/zod-to-openapi` registry | D-10: docs must derive from the Zod schemas |
| Frontend API types | Hand-copied interfaces | `openapi-typescript` over the committed document | Prevents web/API drift; no backend import (D-02) |
| Env parsing | Custom `process.env` checks | Zod schema + `safeParse` | D-25; consistent messages |
| Request ids / request logging | Custom middleware | `pino-http` (`genReqId`) | One line per request, redaction built in |
| Security headers / CORS | Manual header setting | helmet + cors | Baseline hardening (full SEC-05 lands in Phase 2) |
| Import sorting, file-name casing | Docs-only convention | `simple-import-sort`, `unicorn/filename-case` | D-17/D-20 must be machine-enforced |
| Typed Redux hooks | Custom wrappers | `useDispatch.withTypes` / `useSelector.withTypes` | Official pattern |
| Contributor Covenant / Apache text | Writing your own | Official texts (contributor-covenant.org v3.0, apache.org license) | Legal text must match upstream byte-for-byte |
| Shell-script portability | Bash-only npm scripts | Node `.mjs` scripts for repo checks | Works in PowerShell, Git Bash and CI |

**Key insight:** every Phase 1 decision is about making later phases cheap to copy. Anything that is "a convention" but not machine-enforced (layering, hooks-only access, file names, error codes, OpenAPI freshness) will be violated by Phase 3, so prefer an ESLint rule, a drift check or a test over prose.

## Common Pitfalls

### Pitfall 1: Hot reload silently does nothing in the Compose containers
**What goes wrong:** Containers start, page loads, edits on the Windows host never appear.
**Why:** Docker Desktop Windows bind mounts do not deliver inotify events. Measured: Turbopack dev (`next dev`) with or without `WATCHPACK_POLLING` did not update; `next dev --webpack` + `WATCHPACK_POLLING=true` updated within 8s on both `C:` and `D:` drives; `tsx watch` failed without and succeeded with `CHOKIDAR_USEPOLLING=1`; `node --watch` failed; `nodemon --legacy-watch` worked.
**How to avoid:** web command `next dev --webpack -H 0.0.0.0` + `WATCHPACK_POLLING=true`; api `tsx watch` + `CHOKIDAR_USEPOLLING=1`. Document that the host `next dev` (outside Docker) can still use Turbopack.
**Warning signs:** `GET / 200` logs with stale content.

### Pitfall 2: Host `node_modules` vs container `node_modules`
**What goes wrong:** Native binaries (Tailwind oxide, rolldown, esbuild, unrs-resolver) and pnpm symlinks installed on Windows are unusable in Linux.
**How to avoid:** named volumes mounted at `/app/node_modules` (and `/app/.next`) in each service so the container has its own tree; entrypoint runs `pnpm install --frozen-lockfile` each start (a no-op when current). Host `node_modules` is then only for editor/lint/hooks.

### Pitfall 3: Dependency audit is red on day one
**What goes wrong:** D-24 fails the very first PR. Real findings listed in the legitimacy section.
**How to avoid:** `overrides` in each app's `pnpm-workspace.yaml` for transitive fixes, replace the one lint plugin with an unpatched dependency, scope `pnpm audit --prod` vs full audit consciously (full audit chosen: the decision says "adds or keeps"), and for no-fix advisories use a documented, dated `--ignore GHSA-...` allow-list in `docs/standards/security.md`. Re-run `pnpm audit` as the first step of the planning-to-execution handoff: advisories change daily.

### Pitfall 4: Dependabot PRs fail the PR-title rule and `minimumReleaseAge`
**What goes wrong:** Default Dependabot titles ("Bump x from 1 to 2") break D-16's `type: subject` rule; long titles exceed 72 chars; pnpm 11's 1-day release-age check fails Dependabot lockfiles that pick a just-published transitive version (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`).
**How to avoid:** `commit-message.prefix: "chore"`; skip the length rule (or the job) for `dependabot[bot]`; add `minimumReleaseAgeExclude` entries when they occur or add a Dependabot `cooldown`.

### Pitfall 5: Required status checks that never report
**What goes wrong:** Branch protection requires `frontend`, but a path-filtered workflow skipped it, so PRs hang.
**How to avoid:** always-run jobs with stable names; list them in `docs/standards/github-settings.md`. Required checks: `frontend`, `backend`, `pr-title`, CodeQL `analyze`, `dependency-review`, `gitleaks`, `audit`.

### Pitfall 6: CRLF line endings break shell scripts
**What goes wrong:** `core.autocrlf=true` is set globally on this machine, so a fresh clone can give `.husky/*` and `docker/dev-entrypoint.sh` CRLF endings; a CRLF `#!/bin/sh` script fails in Linux containers (`exec ... no such file`) [ASSUMED: standard behaviour, not reproduced]. Every `git add` in scratch printed "LF will be replaced by CRLF".
**How to avoid:** `.gitattributes` with `* text=auto eol=lf` (and explicit `*.sh text eol=lf`, `.husky/* text eol=lf`), `.editorconfig` `end_of_line = lf`, Prettier `endOfLine: "lf"`.

### Pitfall 7: Prisma 7 specifics
- Generation is explicit: no automatic `prisma generate`; add `postinstall` (works without a DB URL) and call it in the entrypoint/CI.
- Output path is mandatory (`output = "../src/generated/prisma"`), the client needs a driver adapter (`new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`), and `.env` is not auto-loaded by the CLI (Compose injects env; for host runs use Node's `--env-file` or `dotenv`) [CITED: prisma.io/docs/v7/prisma-orm/quickstart/postgresql].
- An empty schema (generator + datasource, no models) is valid: `generate` succeeds and `migrate deploy` prints "No migration found" and exits 0 [VERIFIED]. The skeleton can ship with no models; the first real migration is Phase 2's.
- Set `PRISMA_HIDE_UPDATE_MESSAGE=1` to silence the "npm i @prisma/client@latest" banner (it advertises the RC).
- Dependabot will try to bump `prisma` to 8.x when it reaches stable; add it to `ignore` (major) until deliberately migrated.

### Pitfall 8: TypeScript 6 defaults
`types` now defaults to `[]` (set `"types": ["node"]` in backend; Next/RTL/Vitest globals need explicit entries), `strict` defaults true, `module` defaults `esnext`, `rootDir` defaults to `.`, `moduleResolution node` and `baseUrl` are deprecated, `esModuleInterop: false` is disallowed [CITED: devblogs.microsoft.com/typescript/announcing-typescript-6-0/]. Next rewrites `tsconfig.json` to force `esModuleInterop: true` on first build [VERIFIED]; commit it that way. Use `paths` without `baseUrl`.

### Pitfall 9: shadcn init refuses to run without Tailwind
`shadcn init` on an existing Next app exited with "No Tailwind CSS configuration found" until `tailwindcss`, `@tailwindcss/postcss`, `postcss.config.mjs` and a `globals.css` containing `@import "tailwindcss";` (imported in `layout.tsx`) existed. Without `-p nova` the CLI prompts for a preset interactively [VERIFIED]. It generates `components.json`, `src/lib/utils.ts` (`export { cn } from "cn"`), `src/components/ui/button.tsx`, edits `globals.css`. Add `src/components/ui` to ESLint `globalIgnores` since generated code will not satisfy `strictTypeChecked`.

### Pitfall 10: Strict type-checked ESLint friction in tests and configs
`strictTypeChecked` flags supertest's `res.body` (`no-unsafe-member-access`), `no-confusing-void-expression` in arrow shorthands, `restrict-template-expressions` on numbers, and non-null assertions. Config files (`tsup.config.ts`, `vitest.config.ts`) are "not found by the project service" unless included in a tsconfig or linted with `disableTypeChecked`. Plan one `tsconfig.eslint.json`-free approach: include config files in `tsconfig.json` or add `{ files: ["*.config.*"], extends: [tseslint.configs.disableTypeChecked] }`. Type test responses (`const body = res.body as HealthEnvelope` or a parse helper) instead of disabling rules.

### Pitfall 11: Squash merge keeps trailers and bodies
GitHub's squash default builds the commit body from the branch's commits, which can carry `Co-authored-by:` lines. Owner setting: Pull Requests -> squash merging -> "Default commit message: Pull request title" (and "Pull request title and description" is the other, worse option) [ASSUMED: GitHub UI option names; confirm when applying]. Add to the owner checklist.

### Pitfall 12: Windows host Node is not the LTS and has no corepack
Host: Node 25.6.0 (odd, non-LTS), npm 11.8.0, pnpm 10.3.0 globally, **no `corepack` command**. Docker images use Node 24. Hooks ran fine under host Node 25.6 + pnpm 11.28.5 in scratch, so `engines` must be a warning, not a block, for the tooling root (do not enable `engine-strict`). README: install Node 24 (nvm-windows/fnm using `.nvmrc`), then `npm install -g corepack` if the command is missing, then `corepack enable` (may need an elevated shell on Windows; alternative `corepack enable --install-directory <dir on PATH>` [ASSUMED]); or `npm i -g pnpm@11.28.5`. A host `pnpm` 10.3.0 reading `packageManager: pnpm@11.x` will self-switch.

### Pitfall 13: Postgres 18 volume path and init scripts
Mount `db-data` at `/var/lib/postgresql` for PG 18. `docker-entrypoint-initdb.d` scripts only run on an empty data directory, so do not rely on them to create a second (test) database for existing contributors; see test DB recommendation.

### Pitfall 14: Express 5 / body parsing
`req.body` is `undefined` when unparsed, `app.get('/*')` wildcards need names (`/*splat`), `res.json(obj, status)` is removed [CITED: Express 5 migration guide].

## Code Examples

Verified patterns (all ran in the scratch directory this session unless marked).

### Prisma 7 config, schema, client (backend)
```typescript
// prisma.config.ts  [VERIFIED: generate works with no DATABASE_URL; migrate requires it]
import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL },
});
```
```prisma
// prisma/schema.prisma  [VERIFIED; models list may be empty in Phase 1]
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
datasource db {
  provider = "postgresql"
}
```
```typescript
// src/lib/prisma.ts  [VERIFIED]
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../env";
import { PrismaClient } from "../generated/prisma/client";
export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
```

### Backend env (tested; message format)
```typescript
// src/env.ts
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
});
// on failure prints: "Invalid environment configuration:\n  - DATABASE_URL: Invalid input: expected string, received undefined" then process.exit(1)
```

### tsconfig / tsup / vitest (backend)
```json
{ "compilerOptions": { "target": "ES2023", "module": "ESNext", "moduleResolution": "bundler", "strict": true,
  "esModuleInterop": true, "skipLibCheck": true, "noEmit": true, "rootDir": ".", "types": ["node"] },
  "include": ["src", "scripts", "prisma.config.ts", "*.config.ts"] }
```
```typescript
// tsup.config.ts [VERIFIED: bundle ran, env validated on start]
export default defineConfig({ entry: ["src/server.ts"], format: ["esm"], target: "node24", outDir: "dist", clean: true, sourcemap: true });
```
Backend `package.json` has `"type": "module"`; scripts: `dev` (`tsx watch src/server.ts`), `build` (`tsup`), `start`, `lint` (`eslint . --max-warnings 0`), `format:check` (`prettier --check .`), `typecheck` (`tsc --noEmit`), `check` (all three), `test` (`vitest run`), `openapi:generate`, `db:generate`, `db:migrate`, `audit`.

### ESLint flat config (frontend; backend is the same minus Next)
```javascript
// eslint.config.mjs [VERIFIED: loads and reports on ESLint 10.12.0]
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([".next", "node_modules", "next-env.d.ts", "src/components/ui", "src/lib/api/schema.d.ts"]),
  ...nextVitals, ...nextTs,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    plugins: { "simple-import-sort": simpleImportSort, unicorn },
    rules: {
      "simple-import-sort/imports": "error", "simple-import-sort/exports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "unicorn/filename-case": ["error", { case: "kebabCase" }],
    },
  },
  { files: ["**/*.mjs", "**/*.config.ts"], extends: [tseslint.configs.disableTypeChecked] },
  prettier,
]);
```
Next 16 removed `next lint`; the script is `eslint . --max-warnings 0` [ASSUMED: from Next 16 changes; the scratch run used `eslint` directly].

### Vitest (frontend) [VERIFIED: 1 test passed, tsc clean]
```typescript
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: { environment: "jsdom", setupFiles: ["./vitest.setup.ts"], include: ["src/**/*.test.{ts,tsx}"] },
});
// vitest.setup.ts: import "@testing-library/jest-dom/vitest";
```

### Redux store and typed hooks [CITED: redux.js.org/usage/nextjs; test passed in scratch]
```typescript
// src/store/index.ts
export const makeStore = () => configureStore({ reducer: { health: healthReducer } });
export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
// src/store/hooks.ts
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
```

### Frontend env via next.config.ts [VERIFIED]
```typescript
// next.config.ts
import type { NextConfig } from "next";
import "./src/env";
const nextConfig: NextConfig = {};
export default nextConfig;
```

### commitlint.config.mjs [VERIFIED rejections on this machine]
```javascript
const TYPES = ["feat", "fix", "docs", "style", "refactor", "test", "chore", "ci", "build", "perf"];
export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [{ rules: { "no-ai-attribution": ({ raw }) => [
    !/co-authored-by:|generated with \[?claude|noreply@anthropic\.com/i.test(raw ?? ""),
    "commit message must not contain Co-Authored-By or AI attribution"] } }],
  rules: {
    "type-enum": [2, "always", TYPES],
    "header-max-length": [2, "always", 72],
    "body-max-line-length": [0], "footer-max-line-length": [0],
    "no-ai-attribution": [2, "always"],
  },
};
```
`config-conventional`'s default `subject-case` already rejects `Add Thing` (start-case) while still allowing proper nouns mid-subject (`feat: add OpenAPI endpoint`); see A5 on "lowercase".

### pnpm settings files (`pnpm-workspace.yaml` in each app)
```yaml
# backend
allowBuilds: { "@prisma/engines": true, prisma: true, esbuild: true }
overrides: { deepmerge-ts: ">=8.0.0", mysql2: ">=3.23.1" }   # remove when Prisma ships fixed transitive pins
# frontend
allowBuilds: { unrs-resolver: true, sharp: true }
```
Each app also gets `"packageManager": "pnpm@11.28.5"`, `"engines": { "node": ">=24 <25" }`.

### Dev Dockerfile skeleton (no app code baked in, because the bind mount hides it)
```dockerfile
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-slim
RUN corepack enable
WORKDIR /app
COPY docker/dev-entrypoint.sh /usr/local/bin/dev-entrypoint.sh
ENTRYPOINT ["dev-entrypoint.sh"]
# entrypoint (LF!): pnpm install --frozen-lockfile && pnpm exec prisma generate && pnpm exec prisma migrate deploy && exec pnpm dev
```
Note: build context `./backend` means the entrypoint file must live under `backend/`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `next lint`, `.eslintrc` | `eslint .` with flat config `eslint-config-next/*` | Next 16 / ESLint 9-10 | Scripts call ESLint directly |
| Prisma 6 Rust engine, `prisma-client-js`, implicit `.env` | Prisma 7: `prisma-client` generator with explicit `output`, driver adapters, `prisma.config.ts`, ESM | Prisma 7 | Adapter-pg is mandatory; no engine binary in client |
| Prisma 7 stable | Prisma 8 RC is what `prisma@latest` installs; GA expected October 2026; Prisma 7 supported 18 months after 8 GA | RC 2026 | Pin 7.10.0, plan a later migration [CITED: prisma.io/docs/orm/release-status] |
| Zod 3 + `extendZodWithOpenApi` v7 | Zod 4 with zod-to-openapi v8/v9 | 2025-2026 | `z.url()`, `z.coerce`, no v3 |
| pnpm 10 (`.npmrc` settings, `onlyBuiltDependencies`) | pnpm 11: `allowBuilds`, `minimumReleaseAge`, settings in `pnpm-workspace.yaml`, GHSA-based audit | pnpm 11.0 (2026-04-28) | Fails closed on unapproved build scripts |
| Corepack bundled everywhere | Removed from Node 25+ (host here has none); still in Node 24 images (0.36.0) | Node 25 | README needs a fallback |
| TypeScript 5.x | 6.0 bridge release; 7.0 native compiler is `latest` | 2026 | Stay on 6.0.x until typescript-eslint supports 7 |
| Tailwind 3 `tailwind.config.js` | Tailwind 4 CSS-first (`@import "tailwindcss"`, `@tailwindcss/postcss`) | 2025 | `components.json` has `"config": ""` |
| `gitleaks protect` | `gitleaks git --staged` | gitleaks 8.19+ | Use `git` subcommand |

**Deprecated/outdated:** ESLint 9.x (npm-deprecated), `eslint-plugin-check-file` here (unpatched `braces` advisory), `gitleaks-action` for org repos (license), RTK Query (rejected by owner).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A tooling-only root `package.json` (husky, lint-staged, commitlint; own lockfile; not a workspace) is consistent with D-02 | Pattern 8 | If owner reads D-02 as "no root package.json at all", hooks need `core.hooksPath` plus per-app commitlint, more complex |
| A2 | Node 24 is the right pin even though Node 26 becomes LTS on 2026-10-28 (24 -> Maintenance 2026-10-20) | Standard Stack, Open Q1 | D-04 says "current active LTS"; wording may imply Node 26 soon |
| A3 | Package names not found in official docs (zod-to-openapi, simple-import-sort, unicorn, openapi-typescript, tsx, tsup, pino-http, helmet, cors) are legitimate | Package Legitimacy Audit | Slopsquat risk; mitigated by seam results (repos + millions of downloads) and the manifest checkpoint |
| A4 | Error code names `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR` and the health 503 behaviour | Pattern 5 | Cosmetic; locked later by standards doc, costly to rename after Phase 2 |
| A5 | D-14 "lowercase subject" means the subject must not start with a capital (config-conventional default), not "no capital letters anywhere" | Code Examples | Stricter reading rejects `feat: add OpenAPI endpoint`; planner should confirm with owner and document the exact rule |
| A6 | Dependabot can update pnpm 11/12 lockfiles | Pattern 8 | Docs only state pnpm 7/8/9; if unsupported, PRs update `package.json` but not lockfile and CI `--frozen-lockfile` fails; check on first PRs, fall back to pnpm 10 lockfile format (v9) |
| A7 | Using version tags (`@v7`) rather than commit SHAs for Actions is acceptable | Pattern 8 | Supply-chain hardening preference; Dependabot handles either |
| A8 | `no-restricted-imports` overrides can enforce layering and typed-hooks-only | Patterns 1, 4 | If awkward, fall back to a documented convention plus review |
| A9 | `createAsyncThunk.withTypes` exists in RTK 2.13 | Pattern 4 | Fall back to per-thunk generics |
| A10 | Postgres 18 images need the volume at `/var/lib/postgresql` | Standard Stack | Wrong mount path makes PG refuse to start or lose data persistence |
| A11 | CRLF in `.husky/*` or entrypoint scripts breaks them; `.gitattributes eol=lf` fixes it | Pitfall 6 | Contributors on Windows see opaque failures |
| A12 | GitHub UI names for squash default message and push protection settings | Pitfall 11 | Owner checklist wording may need adjusting |
| A13 | `app.listen` error handling in Express 5 (callback receives the error) | Pattern 7 | Port conflicts could appear to start successfully |
| A14 | Repo will be public (needed for free CodeQL, secret scanning, dependency review) | Open Q3 | Private repos need GitHub Advanced Security for several required checks in D-18 |
| A15 | shadcn `-b radix -p nova` is an acceptable base/preset for the skeleton | Pitfall 9 | Phase 2 designs the real component set; re-init is cheap but not free |

## Open Questions

1. **Node 24 or Node 26 for D-04?**
   - Known: today the active LTS is Node 24 "Krypton"; it moves to Maintenance on 2026-10-20 and Node 26 becomes LTS on 2026-10-28 [VERIFIED: nodejs/Release schedule.json]. Prisma 7.10 docs list "Node.js 22.18 or newer (on the 24 line, 24.11 or newer); Node.js 24 is recommended". Node 24 is supported until 2028-04-30.
   - Unclear: whether the owner wants "active LTS" evaluated today or at merge time.
   - Recommendation: pin 24 now, single-source it (`.nvmrc` plus one `NODE_VERSION` build arg and `engines`), add a one-line ADR, and revisit after Prisma 7/Next list Node 26.
2. **Is the GitHub repository public and who owns it (user or organisation)?** Affects free CodeQL, secret scanning, dependency review, `gitleaks-action` licence, and whether branch rulesets are available. No remote exists yet (STATE.md blocker). Recommendation: plan assumes public; deliver `docs/standards/github-settings.md` as the owner checklist: enable Dependency graph, Dependabot alerts + security updates, secret scanning + push protection, private vulnerability reporting, **code scanning "advanced" (workflow file) with default setup off**, branch protection/ruleset for `main` (required checks `frontend`, `backend`, `pr-title`, `analyze`, `dependency-review`, `gitleaks`, `audit`; 1 approval; squash only; default squash message = PR title; delete branch on merge; no force push).
3. **Contact method for SECURITY.md and CODE_OF_CONDUCT enforcement.** Contributor Covenant 3.0 has one required placeholder ("describe your means of reporting here") [CITED: contributor-covenant.org/version/3/0]. Do not reuse the developer's email without asking. Recommendation: SECURITY.md points to GitHub private vulnerability reporting first, with a `<security contact email>` placeholder the owner fills; planner adds a human-verify item.
4. **Should the skeleton include any Prisma model?** Recommendation: no. `SELECT now()` through Prisma proves connectivity, an empty schema works end to end (verified), and the first migration belongs to Phase 2. Document `docker compose exec api pnpm prisma migrate dev` in the backend standard.
5. **D-18 says checks run "for the changed app", CI-01 says both apps on every push/PR.** Recommendation: run both always in Phase 1 (simplest, no pending-check trap); optimise later with an always-running gate job.
6. **"Prisma data access" layer vs D-09's file list (no repository file).** Recommendation: the service imports `prisma` from `lib/prisma.ts` directly; do not add a repository layer in Phase 1; revisit only if a service becomes untestable.
7. **Validation demonstration.** The health endpoint takes no input, so request validation (FND-06) is only exercised by a test-only route in the backend test suite that uses the same `schema.parse` + central error handler path. Confirm that is sufficient or add a harmless validated query parameter.
8. **Test database provisioning (discretion).** Recommendation: same Postgres instance, separate database `opencrm_test` created idempotently by Vitest `globalSetup` (connect to the maintenance DB with `pg`, create if missing, run `prisma migrate deploy` against it), `fileParallelism: false`, test DB URL derived from `DATABASE_URL`. In CI use the `services: postgres` container with the same env. Avoid `docker-entrypoint-initdb.d` (only runs on a fresh volume) and Testcontainers (extra dependency, nested Docker in the dev container).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker Engine + Desktop | FND-04, CI parity, gitleaks hook | yes | Docker 29.4.0, daemon running | none (required by D-03) |
| Docker Compose | FND-04 | yes | v5.1.1 | none |
| Node.js (host) | Hooks, lint-staged, editor tooling | yes, **wrong line** | 25.6.0 (non-LTS) | Install Node 24 via nvm-windows/fnm; hooks worked on 25.6 in scratch |
| corepack (host) | D-01 | **no** (`command not found`) | - | `npm i -g corepack` or `npm i -g pnpm@11.28.5`; node:24 images include corepack 0.36.0 |
| pnpm (host global) | local installs | yes, old | 10.3.0 | `packageManager` field triggers self-switch; `npx pnpm@11.28.5` worked |
| git | hooks | yes | 2.53.0.windows.1, `core.autocrlf=true`, default branch `master` globally (repo is on `main`) | `.gitattributes` |
| gh CLI | owner GitHub setup | yes | 2.89.0, logged in as `mma150` | - |
| gitleaks binary (host) | pre-commit | not checked/not installed | - | Docker image `ghcr.io/gitleaks/gitleaks:v8.30.1` (pulled and verified) |
| Ports 4000, 5432 | Compose | **4000 occupied** on this machine; other Postgres containers exist | - | Make all host ports env-overridable |
| GitHub remote | CI, CodeQL, Dependabot, branch protection | **no remote** | - | Deliver files + checklist; verify after owner pushes |
| Network pulls (npm, Docker Hub, ghcr.io) | install | yes | - | - |

**Missing dependencies with no fallback:** none for authoring. GitHub-side behaviour cannot be verified until a remote exists.
**Missing dependencies with fallback:** corepack on host (use `npm i -g`), local gitleaks (Docker image), host Node line (warn only).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3 on both sides (D-13); supertest 7.3.1 (backend); Testing Library 16.3.3 + jest-dom 7.0.1 + jsdom 30.1.2 (frontend) |
| Config file | `backend/vitest.config.ts`, `frontend/vitest.config.ts` + `vitest.setup.ts` (created in Wave 0; scratch versions ran green) |
| Quick run command | `pnpm --dir backend test` / `pnpm --dir frontend test` |
| Full suite command | per app `pnpm check && pnpm test && pnpm build`, plus root `node scripts/verify-foundation.mjs` and `pnpm test:commitlint` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FND-01 | `frontend/`, `backend/`, `mobile/` exist with expected anchors | repo check | `node scripts/verify-foundation.mjs` | Wave 0 |
| FND-02 | Standards docs exist and are linked from README/CONTRIBUTING | repo check | `node scripts/verify-foundation.mjs` | Wave 0 |
| FND-03 | Lint/format/typecheck fail on violation, pass on clean tree | script | `pnpm --dir backend check` and `pnpm --dir frontend check` (clean = exit 0); negative: add `any`/unsorted import in a temp file = non-zero | Wave 0 |
| FND-04 | Full stack starts from README command; web shows live status | smoke | `docker compose up -d --wait && curl -fsS localhost:4000/api/v1/health && curl -fsS localhost:3000` (optional CI job `compose-smoke`) | Wave 0 |
| FND-05 | Slice loads health via thunk, handles loading/success/error | unit/component | `pnpm --dir frontend test -- health` | Wave 0 |
| FND-06 | Envelope shape, 404 -> `NOT_FOUND`, ZodError -> `VALIDATION_FAILED`, DB down -> `SERVICE_UNAVAILABLE`, no stack leak | integration (supertest, real DB) | `pnpm --dir backend test -- health` | Wave 0 |
| FND-07 | `/api/v1/openapi.json` is 3.1.0, lists `/health`; committed files are not stale | integration + drift | `pnpm --dir backend test -- openapi` and `pnpm --dir backend openapi:generate && git diff --exit-code` | Wave 0 |
| FND-08 | Missing/invalid env exits non-zero naming the variable; `.env.example` covers all schema keys | unit + repo check | `pnpm --dir backend test -- env`, `node scripts/verify-foundation.mjs`; frontend: `NEXT_PUBLIC_API_URL= pnpm --dir frontend build` exits non-zero | Wave 0 |
| CTB-01 | LICENSE is Apache-2.0, CONTRIBUTING and CODE_OF_CONDUCT present | repo check | `node scripts/verify-foundation.mjs` | Wave 0 |
| CTB-02 | PR template and issue forms present | repo check | same | Wave 0 |
| CTB-03 | Commit standard documented and doc list equals config `type-enum` | repo check | same | Wave 0 |
| CTB-04 | Hook rejects bad message, accepts good one | script | `pnpm test:commitlint` (fixtures piped to `commitlint`, expect exit codes) and manual `git commit -m "bad"` on a clean tree | Wave 0 |
| CTB-05 | Branch/PR rules documented | repo check | `node scripts/verify-foundation.mjs` (file + headings) | Wave 0 |
| CI-01 | Workflows valid and run lint/type-check/test/build for both apps | static + post-push | `docker run --rm -v "$(pwd -W):/repo" -w /repo rhysd/actionlint:latest` (local); green run on GitHub after first push (human) | Wave 0 |
| CI-02 | PR title check fails on bad title | script + post-push | `printf 'Bad title\n' \| pnpm exec commitlint` exits non-zero; workflow run on a throwaway PR (human) | Wave 0 |
| SEC-01 | `dependabot.yml` valid, grouping/security separation present | static + post-push | `node scripts/verify-foundation.mjs` (parse YAML, assert ecosystems/dirs); GitHub validates on push (human: check Insights -> Dependency graph -> Dependabot) | Wave 0 |
| SEC-02 | CodeQL workflow has `pull_request` and `schedule` triggers | static + post-push | verify-foundation parses `codeql.yml`; first run on GitHub (human) | Wave 0 |
| SEC-03 | Staged secret is blocked locally; CI scan job exists | script | stage a fake PAT in a temp repo and run the hook = non-zero (scripted in `scripts/`); CI `gitleaks` job (post-push); push protection is owner-enabled (human) | Wave 0 |
| SEC-04 | SECURITY.md present with reporting instructions | repo check | verify-foundation | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --dir <app> check` and `pnpm --dir <app> test` for the touched app (quick, under ~30s once deps are installed; backend tests need the Postgres container up).
- **Per wave merge:** both apps' full `check && test && build`, root `verify-foundation`, `test:commitlint`, `pnpm audit --audit-level=high` per app.
- **Phase gate:** the above plus `docker compose up -d --wait` smoke from a clean volume, and the human-verify items (GitHub settings, first CI run, Dependabot/CodeQL visible) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] Everything: greenfield. No test framework, configs, fixtures or scripts exist.
- [ ] `backend/vitest.config.ts` + `globalSetup` (create `opencrm_test`, `prisma migrate deploy`), `frontend/vitest.config.ts` + `vitest.setup.ts`
- [ ] `scripts/verify-foundation.mjs` (file/heading presence, `.env.example` vs Zod keys drift, `.nvmrc` = Dockerfile `NODE_VERSION` = `engines`, doc type list = commitlint list)
- [ ] `test:commitlint` fixtures (good: `feat: add lead list`, `fix(api): handle null`; bad: capital subject, missing type, 73 chars, trailer)
- [ ] Framework install: see Installation section

## Security Domain

`security_enforcement` is enabled (absent = enabled; `security_asvs_level: 1`, `security_block_on: high` in config).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (Phase 2) | - |
| V3 Session Management | no (Phase 2) | - |
| V4 Access Control | no (Phase 3); CORS allow-list is the only cross-origin control now | `cors` with explicit `CORS_ORIGINS` list |
| V5 Input Validation | yes (pattern established here) | Zod `parse` in controllers; central `VALIDATION_FAILED` mapping |
| V6 Cryptography | no (no secrets/crypto code); request ids use `crypto.randomUUID()` | Node `crypto`, never hand-rolled |
| V7 Error handling & logging | yes | Central error handler, no stack traces in responses, pino with header/cookie redaction |
| V10 Malicious code / V14 Configuration | yes | helmet defaults (observed CSP, HSTS, `X-Content-Type-Options`), env validation, no secrets in git (gitleaks), locked dependency versions |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Committed credential | Information disclosure | gitleaks hook + CI + GitHub push protection (D-23) |
| Vulnerable or malicious dependency / slopsquatting | Tampering | Exact pins, manifest-level human review, `pnpm audit` gate, dependency-review, Dependabot, pnpm `allowBuilds` (no unapproved install scripts), `minimumReleaseAge` |
| Workflow script injection via PR title | Elevation of privilege | Pass `github.event.pull_request.title` through `env:`, never inline; minimal `permissions`; CodeQL `actions` scanning optional |
| Compromised third-party Action | Tampering | Pin tags/SHAs, Dependabot `github-actions` updates, `permissions: contents: read` default |
| Error/stack leakage | Information disclosure | Envelope with code + message only; log details server-side |
| Overly permissive CORS | Spoofing/Tampering | Explicit origin list from env, no `*` |
| Dev credentials reused in production | Information disclosure | Dev DB credentials live only in `compose.yaml`, documented dev-only; real `.env` never committed; `.env.example` holds placeholders |
| DB port exposed on all interfaces | Information disclosure | Publish Postgres on `127.0.0.1` only |
| Request-id spoofing/log injection | Tampering | Accept inbound `X-Request-Id` only if it matches a strict pattern and length; otherwise generate |

## Sources

### Primary (HIGH confidence)
- Local runs in scratch directories this session: pnpm 11.28.5 installs; `next build` with Next 16.4.0 + TS 6.0.3; ESLint 10.12.0 + eslint-config-next 16.4.0 + typescript-eslint strictTypeChecked + unicorn + simple-import-sort; Express 5.2.1 + Prisma 7.10.0 + adapter-pg + Postgres 18 + supertest/Vitest 5.0.3; tsup bundle; zod-to-openapi 9.1.0 + openapi-typescript 7.13.0; husky 9.1.7 + commitlint 21.2.3 + lint-staged 17.6.0; gitleaks v8.30.1 Docker; shadcn 4.21.4 init; Docker Compose env_file layering; Docker Desktop bind-mount hot reload matrix (Turbopack/webpack, tsx/node --watch/nodemon).
- npm registry (`npm view` for all versions, dist-tags, peerDependencies, deprecation of eslint 9.39.5), GitHub tags via `git ls-remote` (actions versions), nodejs.org dist index and nodejs/Release schedule.json.
- `gsd-tools query package-legitimacy check` results (signals quoted above).
- https://www.prisma.io/docs/orm/release-status ; https://www.prisma.io/docs/v7/prisma-orm/quickstart/postgresql
- https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
- https://expressjs.com/en/guide/migrating-5.html
- https://redux.js.org/usage/nextjs
- https://pnpm.io/blog/releases/11.0 and /12.0
- https://github.com/pnpm/action-setup ; https://github.com/actions/dependency-review-action ; https://github.com/gitleaks/gitleaks-action
- https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference
- https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/customizing-your-advanced-setup-for-code-scanning

### Secondary (MEDIUM confidence)
- https://dev.classmethod.jp/en/articles/pnpm-11-minimum-release-age-dependabot-ci-failure/ (pnpm 11 vs Dependabot)
- https://ui.shadcn.com/docs/installation/next ; https://github.com/asteasolutions/zod-to-openapi ; https://github.com/samchungy/zod-openapi
- https://www.contributor-covenant.org/version/3/0/code_of_conduct/

### Tertiary (LOW confidence, marked [ASSUMED] in text)
- GitHub UI option names for squash default message / push protection; Dependabot behaviour with pnpm 11/12 lockfiles; CRLF failure mode of shell scripts; Postgres 18 image volume note.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - versions queried live and the combination was installed and exercised (build, lint, tests, DB) in scratch directories.
- Architecture: HIGH for backend/frontend/Compose/hook patterns (run), MEDIUM for CI/CodeQL/Dependabot YAML (action versions verified, workflows not executable without a remote).
- Pitfalls: HIGH for items marked VERIFIED (hot reload, audit, pnpm 11 build gating, Prisma config, shadcn/Tailwind, TS 6); MEDIUM/LOW for items marked ASSUMED.

**Research date:** 2026-10-08
**Valid until:** 2026-10-22 (14 days): fast-moving. Prisma 8 GA (expected October), Node 26 LTS on 2026-10-28, ESLint/eslint-config-next peer updates, and daily npm advisories can all change the pins above. Re-run `npm view` for the pinned packages and `pnpm audit` at the start of execution.
