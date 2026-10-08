---
phase: 01-repository-foundation-standards
plan: 01
subsystem: infra
tags: [pnpm, lockfile, supply-chain, node-24, husky, commitlint, next, express, prisma]

requires: []
provides:
  - Three owner-approved, exact-pinned dependency manifests (backend, frontend, tooling-only root) with resolved lockfiles
  - Single-sourced Node 24 and pnpm 11.28.5 (.nvmrc, engines, packageManager)
  - LF line-ending and ignore rules (.gitattributes, .gitignore)
  - pnpm install-script allow-lists and audit overrides per app
affects: [01-02, 01-03, 01-04, 01-05, 01-06, 01-07, 01-08, 01-09, 01-10, ci, husky, commitlint]

actuals:
  tokens: 131000
  tasks: 4
  commits: 2

tech-stack:
  added: [pnpm 11.28.5, express 5.2.1, prisma 7.10.0, next 16.4.0, react 19.3.0, typescript 6.0.3, eslint 10.12.0, vitest 5.0.3, husky 9.1.7, lint-staged 17.6.0, commitlint 21.2.3]
  patterns:
    - "Exact pins only (no caret, tilde, star, latest); lockfile resolved with --lockfile-only before any install"
    - "Each app owns its package.json, pnpm-workspace.yaml and pnpm-lock.yaml; the root is tooling-only and not a workspace of the apps"
    - "Owner approval gate (blocking-human) per manifest before the first install"

key-files:
  created:
    - .nvmrc
    - .gitignore
    - .gitattributes
    - package.json
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
    - backend/package.json
    - backend/pnpm-workspace.yaml
    - backend/pnpm-lock.yaml
    - frontend/package.json
    - frontend/pnpm-workspace.yaml
    - frontend/pnpm-lock.yaml
  modified: []

key-decisions:
  - "Node stays at 24 (assumption A2 settled): .nvmrc 24, engines >=24 <25, even though Node 26 becomes LTS on 2026-10-28; a later bump is one line in .nvmrc plus the engines range"
  - "Tooling-only root package.json with its own lockfile, not a workspace containing backend/ or frontend/, is consistent with D-02 (assumption A1 accepted by owner)"
  - "Owner accepted risk: frontend auditConfig.ignoreGhsas GHSA-vfj7-8cjw-p6xm (braces <=3.0.3, no patched version exists, reached only via build-time tooling shadcn and eslint-config-next); remove when a patched braces is published"
  - "Owner accepted minimumReleaseAgeExclude for shadcn@4.21.4 and @shadcn/registry@0.1.3 (releases younger than the one-day gate on 2026-10-08)"
  - "Root peers typescript 7.0.2 and @types/node 26.6.4 auto-resolved as peers of commitlint's config loader were accepted as-is and are not pinned (root tooling only)"
  - "Backend overrides deepmerge-ts >=8.0.0 and mysql2 >=3.23.1 remove the two day-one high advisories that arrive through the Prisma CLI"

patterns-established:
  - "Dependency gate: no install until the owner has approved each manifest"
  - "Security tracking: pnpm audit --audit-level=high must exit 0 per app; any ignore is dated, justified and owner-approved"

requirements-completed: [FND-01]

coverage:
  - id: D1
    description: "Three exact-pinned manifests (backend, frontend, root tooling) with resolved lockfiles, Node/pnpm single-sourced"
    requirement: FND-01
    verification:
      - kind: other
        ref: "plan Task 1 automated node check (exact pins, packageManager, engines, lockfiles, no node_modules, .nvmrc)"
        status: pass
    human_judgment: false
  - id: D2
    description: "pnpm audit --audit-level=high exits 0 in backend/ and frontend/"
    requirement: FND-01
    verification:
      - kind: other
        ref: "npx pnpm@11.28.5 audit --audit-level=high (backend, frontend)"
        status: pass
    human_judgment: false
  - id: D3
    description: "pnpm ls -r --depth -1 at the repository root lists only the opencrm tooling package"
    requirement: FND-01
    verification:
      - kind: other
        ref: "npx pnpm@11.28.5 ls -r --depth -1"
        status: pass
    human_judgment: false
  - id: D4
    description: "Owner approval of each of the three dependency manifests before any install"
    verification: []
    human_judgment: true
    rationale: "Approval is an owner decision recorded from three blocking-human checkpoints; no test can assert it"

duration: n/a (spans three owner checkpoints)
completed: 2026-10-08
status: complete
---

# Phase 1 Plan 01: Dependency Manifests Summary

**Owner-approved exact-pinned manifests and lockfiles for backend (Express 5 / Prisma 7.10), frontend (Next 16.4 / React 19.3) and a tooling-only root (husky, lint-staged, commitlint), Node 24 single-sourced, nothing installed.**

## Performance

- **Duration:** spans three owner checkpoints (wall-clock not meaningful)
- **Completed:** 2026-10-08T10:13:00Z
- **Tasks:** 4 (1 auto, 3 blocking-human checkpoints)
- **Files modified:** 12 created (plan manifests and hygiene files), 1 comment-only edit

## Accomplishments

- Backend, frontend and root manifests pinned to exact versions with `packageManager pnpm@11.28.5`, `engines.node >=24 <25` and `.nvmrc` 24; lockfiles resolved with `pnpm install --lockfile-only`, no `node_modules` anywhere.
- Install scripts restricted by per-app `allowBuilds` (backend: `@prisma/engines`, `prisma`, `esbuild`; frontend: `unrs-resolver`, `sharp`).
- Audit gate met: backend reports 1 low only; frontend reports 1 high that is an owner-accepted, dated ignore; both exit 0 at `--audit-level=high`.
- LF enforced via `.gitattributes` (`* text=auto eol=lf`, `*.sh`, `.husky/*`); `.gitignore` covers build output, env files (keeping `.env.example`), generated Prisma client and editor noise.
- Owner approved all three manifests before any install.

## Task Commits

1. **Task 1: Write the three exact-pinned manifests and resolve lockfiles without installing** - `add3c1f` (chore)
2. **Task 2: Approve the backend dependency manifest** - no commit, owner "approved" 2026-10-08
3. **Task 3: Approve the frontend dependency manifest** - no commit, owner "approved" 2026-10-08
4. **Task 4: Approve the root tooling manifest** - no commit, owner "approved" 2026-10-08

**Follow-up (comment only):** `b0bc489` (chore) updated the stale "owner decision pending" comment in `frontend/pnpm-workspace.yaml` to "owner-approved at plan 01-01 Task 3".

**Plan metadata:** recorded in the docs(01-01) commit that follows this file.

## Files Created/Modified

- `.nvmrc` - single source for the Node major (24)
- `.gitattributes` - LF line endings for all text files
- `.gitignore` - node_modules, build output, env files, generated Prisma client, tsbuildinfo, next-env.d.ts, OS/editor noise
- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` - tooling-only root (husky 9.1.7, lint-staged 17.6.0, @commitlint/cli and config-conventional 21.2.3); workspace `packages: ["."]` so apps are not members; no `prepare` script yet (plan 01-08 adds it)
- `backend/package.json`, `backend/pnpm-workspace.yaml`, `backend/pnpm-lock.yaml` - Express 5.2.1, zod 4.6.5, Prisma 7.10.0 with adapter-pg, pino, helmet, cors; dev tooling; `allowBuilds` and `overrides`
- `frontend/package.json`, `frontend/pnpm-workspace.yaml`, `frontend/pnpm-lock.yaml` - Next 16.4.0, React 19.3.0, RTK 2.13.0 (no RTK Query, D-06), Tailwind 4.3.3, shadcn base set, test and lint tooling; `allowBuilds`, release-age exclusions and the audit ignore

## Decisions Made

Owner decisions, all dated 2026-10-08:

- **Task 2 (backend):** manifest approved as written. Assumption A2 settled: Node stays at 24.
- **Task 3 (frontend):** manifest approved as written, including `auditConfig.ignoreGhsas: [GHSA-vfj7-8cjw-p6xm]` (braces <=3.0.3, stack exhaustion on deeply nested globs; no patched version exists; reached only via build-time tooling `shadcn` and `eslint-config-next`). This is an owner-accepted risk to be removed when a patched braces is published. Also accepted: `minimumReleaseAgeExclude` for `shadcn@4.21.4` and `@shadcn/registry@0.1.3`.
- **Task 4 (root):** manifest approved as written. Assumption A1 accepted: a tooling-only root `package.json` with its own lockfile, not a workspace containing `backend/` or `frontend/`, is consistent with D-02. The auto-resolved root peers (typescript 7.0.2, @types/node 26.6.4) are accepted as-is and not pinned.

Pins that differ from the research list: none found. The Task 1 executor resolved the "resolve exact" entries as: `@types/cors` 2.8.19, `@types/pg` 8.23.1, `@types/node` 24.19.1 (both apps), `@types/react` 19.3.0, `postcss` 8.5.29, `radix-ui` 1.7.0, `class-variance-authority` 0.7.1, `lucide-react` 1.52.0, `tw-animate-css` 1.4.0, `cn` 0.4.0.

Overrides added (backend only, `backend/pnpm-workspace.yaml`): `deepmerge-ts >=8.0.0`, `mysql2 >=3.23.1`. No frontend overrides.

## Deviations from Plan

None - plan executed exactly as written. The only extra change is the comment-only commit `b0bc489`, which brings a "pending" comment in line with the recorded owner decision (no behavioural change).

## Issues Encountered

- Backend `pnpm audit` reports 1 low advisory: esbuild via tsup > bundle-require (GHSA-g7r4-m6w7-qqqr). Below the high gate, left in place.
- Frontend peer warnings from lockfile resolution: eslint 10 vs `eslint-plugin-react`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y` (via `eslint-config-next`), and `openapi-typescript` 7.13.0 declares typescript ^5 while 6.0.3 is pinned. These are untested; they surface only when later plans run lint and `api:types`.
- Lockfiles were produced with `npx pnpm@11.28.5 install --lockfile-only` because the host has pnpm 10.3.0 and no corepack. The pnpm store is `D:\.pnpm-store\v11`. Nothing was installed in this plan.
- The host runs Node 25.6.0, so pnpm prints "Unsupported engine" warnings against `>=24 <25`. Expected, since `engine-strict` is deliberately not set.

## Verification Results (re-run during close-out)

- Task 1 automated node check (exact pins, `packageManager`, `engines`, lockfiles present, no `node_modules`, `.nvmrc` 24): `ok`.
- `pnpm audit --audit-level=high` in `backend/`: 1 low, exit 0. In `frontend/`: 1 high, ignored by the owner-approved entry, exit 0.
- `pnpm ls -r --depth -1` at the root: lists only `opencrm@0.0.0`.
- No `node_modules` in root, `backend/` or `frontend/`.
- `git log` subject for `add3c1f` is a single line with no trailer.

## Known Stubs

None. This plan contains no product code.

## Threat Flags

None. The threats in the plan register (T-01-SC, T-01-01, T-01-02, T-01-03) are all mitigated as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 01-02 (walking-skeleton tracer) can run `pnpm install --frozen-lockfile` in each app against the approved lockfiles without changing any package.
- Follow-up: remove the `GHSA-vfj7-8cjw-p6xm` ignore and the two `minimumReleaseAgeExclude` entries once a patched braces exists and the shadcn releases are older than a day.
- Watch for the untested frontend peer-warning combinations when lint and `api:types` first run.
- FND-01 also requires a `mobile/` folder with its conventional structure; this plan did not create it.

---
*Phase: 01-repository-foundation-standards*
*Completed: 2026-10-08*

## Self-Check: PASSED

All twelve plan files exist on disk, commits `add3c1f` and `b0bc489` exist in `git log`, and all plan-level verification commands above were re-run and passed.
