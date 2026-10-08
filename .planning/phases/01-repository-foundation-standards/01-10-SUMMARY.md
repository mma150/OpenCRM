---
phase: 01-repository-foundation-standards
plan: 10
subsystem: infra
tags: [github-actions, ci, codeql, dependabot, gitleaks, pnpm-audit, security-policy, verifier]
status: complete

requires:
  - phase: 01-repository-foundation-standards
    provides: per-app scripts (plans 01-04 to 01-07), commitlint config and pinned gitleaks image (plan 01-08), documents that link to the files created here (plan 01-09)
provides:
  - "Five GitHub workflows: ci (frontend, backend), pr-title, codeql (analyze), secrets (gitleaks), audit (audit, dependency-review)"
  - ".github/dependabot.yml (weekly, grouped routine updates per app, chore prefix, cooldown) and the pull request template and issue forms"
  - "SECURITY.md, docs/standards/security.md, docs/standards/github-settings.md (the owner's checklist for settings that are not files)"
  - "scripts/verify-foundation.mjs (pnpm verify:foundation): fourteen consistency checks that fail closed, plus WARN lines for owner-input tokens"
affects: [phase-02, ci, github-settings]

actuals:
  tokens: 16500
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Required checks are job ids (frontend, backend, pr-title, analyze, dependency-review, gitleaks, audit); no path filters, so every check reports on every change"
    - "Untrusted workflow input (the pull request title) reaches scripts only through env; the verifier fails on any ${{ }} inside a run script"
    - "A CI scan that can silently scan nothing is compared against an independent host-side count"
    - "Repository consistency checked by a dependency-free node script that reads workflows as text"

key-files:
  created:
    - .github/workflows/ci.yml
    - .github/workflows/pr-title.yml
    - .github/workflows/codeql.yml
    - .github/workflows/secrets.yml
    - .github/workflows/audit.yml
    - .github/dependabot.yml
    - .github/PULL_REQUEST_TEMPLATE.md
    - .github/ISSUE_TEMPLATE/bug-report.yml
    - .github/ISSUE_TEMPLATE/feature-request.yml
    - .github/ISSUE_TEMPLATE/config.yml
    - SECURITY.md
    - docs/standards/security.md
    - docs/standards/github-settings.md
    - scripts/verify-foundation.mjs
  modified: []

key-decisions:
  - "CI runs both apps on every push and pull request with no path filter (D-18 'changed app' loses to CI-01 and the never-reporting-check trap)"
  - "The CI secret scan compares gitleaks' scanned-commit count with a count made by git on the runner, because gitleaks exits 0 with '0 commits scanned' when it cannot read the repository"
  - "The CI secret scan calls the pinned image's detect subcommand instead of git, because the git form could not be run in this sandbox (see Deviations)"
  - "The braces ignore that already exists in frontend/pnpm-workspace.yaml is recorded as a dated row in the audit allow-list, so the allow-list is not empty"
  - "Dependabot gets a two-day cooldown on npm entries so lockfile pull requests do not pick a release younger than pnpm's one-day minimumReleaseAge"

requirements-completed: [CTB-02, CTB-05, CI-01, CI-02, SEC-01, SEC-02, SEC-03, SEC-04]

coverage:
  - id: D1
    description: "ci.yml runs install, lint, format:check, typecheck, test, build and a drift step for frontend and backend on every push and pull request, no path filter"
    requirement: CI-01
    verification:
      - kind: command
        ref: "actionlint (docker rhysd/actionlint:latest, read-only mount) exit 0; verify-foundation check 08; the same commands run locally in both apps (all pass)"
        status: pass
    human_judgment: false
  - id: D2
    description: "pr-title.yml checks the title and commits with the repository commitlint config; the title reaches the script only through PR_TITLE"
    requirement: CI-02
    verification:
      - kind: command
        ref: "actionlint exit 0 (it also flags an inlined title: proven on a throwaway workflow); commitlint rejects 'Bad title' (exit 1) and accepts 'feat: add lead list' (exit 0); verify-foundation check 09 caught an inlined title"
        status: pass
    human_judgment: false
  - id: D3
    description: "codeql.yml analyses javascript-typescript on pull requests, pushes to main and weekly"
    requirement: SEC-02
    verification:
      - kind: command
        ref: "actionlint exit 0; verify-foundation check 10"
        status: pass
    human_judgment: true
    rationale: "Whether GitHub accepts the workflow and uploads results can only be seen after the first push with default setup off"
  - id: D4
    description: "Dependabot: grouped weekly routine updates per app, security updates ungrouped, chore prefix"
    requirement: SEC-01
    verification:
      - kind: command
        ref: "dependabot.yml validated against the SchemaStore dependabot-2.0 schema (valid; a bad group value is rejected by the same validator); verify-foundation check 12"
        status: pass
    human_judgment: true
    rationale: "Dependabot behaviour (one pull request per app, no duplicates, cooldown honoured) is GitHub-side and only visible after the first push"
  - id: D5
    description: "CI secret scan over the full history that cannot pass without scanning"
    requirement: SEC-03
    verification:
      - kind: command
        ref: "gitleaks image on a normal clone reports 48 commits scanned, equal to the host-side count (48); on this linked worktree the same scan reports '0 commits scanned', 'no leaks found', exit 0, which the committed guard rejects (0 != 48); actionlint (with shellcheck) passes the step"
        status: pass
    human_judgment: true
    rationale: "The committed step as a whole was not executed end to end here (the sandbox refuses to run it); its first real run is on GitHub"
  - id: D6
    description: "Audit gate: high and critical fail, moderate and low report only; dependency review on pull requests"
    requirement: SEC-01
    verification:
      - kind: command
        ref: "pnpm audit --audit-level=high exit 0 in both apps (backend 1 low; frontend 1 owner-accepted high ignored); backend at --audit-level=low exits 1, so the threshold is a real gate"
        status: pass
    human_judgment: false
  - id: D7
    description: "SECURITY.md, issue forms, pull request template, owner checklist for branch protection with the seven required checks"
    requirement: SEC-04
    verification:
      - kind: command
        ref: "verify-foundation checks 01, 02, 13, 14 (headings, links, no email address); owner-input token printed as WARN"
        status: pass
    human_judgment: true
    rationale: "The security contact and the branch protection settings are owner decisions that cannot be asserted from files"
  - id: D8
    description: "verify-foundation.mjs exits 0 on the finished repository and non-zero when any of the fourteen rules is broken"
    verification:
      - kind: command
        ref: "node scripts/verify-foundation.mjs: 14 of 14 pass, exit 0; 18 deliberate breakages, each exit 1 naming the expected check; after restore exit 0"
        status: pass
    human_judgment: false

duration: ~1 h 15 min
completed: 2026-10-08
---

# Phase 1 Plan 10: GitHub Workflows, Security Configuration and Foundation Verifier Summary

**Five GitHub workflows (CI for both apps, pull request title check, CodeQL, history-wide gitleaks with a fail-closed scan count, high-severity audit and dependency review), grouped Dependabot, templates, SECURITY.md, the owner's GitHub settings checklist, and `pnpm verify:foundation` with fourteen checks proven to fail on 18 deliberate breakages.**

## Performance

- **Duration:** about 1 h 15 min
- **Tasks:** 3 of 3
- **Files:** 14 created, 0 modified (plus this summary)

## Accomplishments

- `ci.yml`: jobs `frontend` and `backend`, triggers `push` and `pull_request` with no filter, read-only token, concurrency group with cancel-in-progress, Node from `.nvmrc`, pnpm from `packageManager`, install with the frozen lockfile, then lint, format:check, typecheck, test, build and a drift step (`pnpm api:types` / `pnpm openapi:generate` then `git diff --exit-code` on the generated file). The backend job has a `postgres:18-alpine` service and `DATABASE_URL`; the frontend job sets `NEXT_PUBLIC_API_URL`.
- `pr-title.yml`: re-runs on `edited`, skipped for `dependabot[bot]`, title through `PR_TITLE`, commit range through `BASE_SHA` and `HEAD_SHA`.
- `codeql.yml` (job `analyze`), `secrets.yml` (job `gitleaks`), `audit.yml` (jobs `audit`, `dependency-review`), all with `permissions: contents: read` at the top and no `continue-on-error`.
- `dependabot.yml`: seven entries (npm for `/`, `/frontend`, `/backend`; github-actions; docker for both apps; docker-compose), weekly on Monday, `routine` group limited to minor and patch version updates on the npm entries, `chore` prefix everywhere, ignores for TypeScript and `@types/node` majors and Prisma majors.
- `SECURITY.md` (private vulnerability reporting first, fallback is the owner token), `docs/standards/security.md`, `docs/standards/github-settings.md`, templates and issue forms.
- `scripts/verify-foundation.mjs`: node built-ins plus the root commitlint config only.

## What was verified, by level

### 1. Verified locally (commands run, results)

| What I ran | Result |
| --- | --- |
| `docker run rhysd/actionlint:latest` over the repository (read-only mount), after task 1 and again after task 2 | exit 0, no findings. actionlint also runs shellcheck: a broken script and an inlined pull request title in a throwaway workflow both produced exit 1, so a clean run means something |
| Backend, exactly as CI: `pnpm lint`, `format:check`, `typecheck`, `test`, `build`, `openapi:generate` + `git diff --exit-code` (PostgreSQL from Compose on port 5440) | all exit 0; 4 test files, 36 tests; no drift |
| Frontend, exactly as CI: `pnpm lint`, `format:check`, `typecheck`, `test`, `build` (with `NEXT_PUBLIC_API_URL`), `api:types` + `git diff --exit-code` | all exit 0; 19 tests; no drift. `typecheck` passes on a tree with no `next-env.d.ts`, as in CI |
| `pnpm audit --audit-level=high` in `backend/` and `frontend/` | both exit 0 (backend: 1 low; frontend: the 1 owner-accepted high is ignored). Backend at `--audit-level=low` exits 1, so the flag is a real gate |
| `commitlint` fed `Bad title` / `feat: add lead list` | exit 1 (subject-empty, type-empty) / exit 0 |
| `pnpm test:commitlint` / `pnpm test:secret-hook` | 19 of 19 / 4 of 4 |
| `dependabot.yml` against the SchemaStore `dependabot-2.0` JSON schema (ajv, yaml from existing `node_modules`; scratch script, not committed) | valid; a bad `update-types` value is rejected by the same script |
| gitleaks `v8.30.1` image on a normal clone, read-only mount, with the `safe.directory` environment variables | 48 commits scanned, no leaks, exit 0 |
| `git log -p -U0 --full-history --all` piped to the awk count used in `secrets.yml` | 48, equal to gitleaks' count |
| The same gitleaks image on this linked worktree (the `.git` file points outside the mount) | `fatal: not a git repository`, `0 commits scanned`, `no leaks found`, exit 0: it fails open exactly as plan 01-08 found. The committed guard compares 0 with the expected 48 and fails |
| `node scripts/verify-foundation.mjs` and `pnpm run verify:foundation` | 14 of 14 PASS, exit 0, two WARN lines (`CODE_OF_CONDUCT.md` conduct contact, `SECURITY.md` security contact) |
| 18 deliberate breakages of the verifier (scratch harness, files restored each time) | every one exit 1 naming the expected check; after restore exit 0 (table below) |
| `docker compose up -d --wait` (ports 4010/5440/3010), then `curl` | API `{"data":{"status":"ok","database":{"connected":true,...}}}`, web HTTP 200; `docker compose down` afterwards |

Verifier negative checks (each: break one thing, run, see exit 1 and the message, restore):

| Breakage | Check that failed | Message (abridged) |
| --- | --- | --- |
| Remove the `perf` row from `docs/standards/commits.md` | 06 | only in commitlint.config.mjs: perf |
| `.nvmrc` says 25 | 03 | both Dockerfiles: NODE_VERSION default is 24, .nvmrc says 25 |
| `backend/Dockerfile` `ARG NODE_VERSION=22` | 03 | NODE_VERSION default is 22, .nvmrc says 24 |
| `"cors": "^2.8.6"` in `backend/package.json` | 04 | dependencies.cors is "^2.8.6", not an exact version |
| `CORS_ORIGINS` removed from `backend/.env.example` | 05 | backend/.env.example is missing CORS_ORIGINS |
| `INTERNAL_ERROR` row removed from `docs/standards/backend.md` | 07 | only in app-error.ts: INTERNAL_ERROR |
| `paths:` filter added under `push` in `ci.yml` | 08 | has a path, branch or tag filter under on: |
| `pnpm typecheck` removed from the frontend job | 08 | run steps must include, in order: ... |
| Pull request title written into a `run:` script | 09 | title used outside PR_TITLE; a run script contains a `${{ }}` expression |
| `continue-on-error: true` added to the audit job | 10 | continue-on-error makes a check advisory |
| One app's audit threshold changed to critical | 10 | --audit-level=high must run for both apps (found 1) |
| gitleaks tag `v8.30.0` in `secrets.yml` | 11 | gitleaks version differs: secrets.yml 8.30.0, hook 8.30.1 |
| npm `/backend` entry renamed in `dependabot.yml` | 12 | no npm entry for /backend |
| `major` added to the routine group | 12 | routine must include minor and patch updates only |
| Broken link added to `README.md` | 13 | broken link to docs/standards/nope.md |
| Email address added to `SECURITY.md` | 14 | contains an email address |
| `## What to include` renamed in `SECURITY.md` | 02 | missing heading "What to include" |
| `.github/PULL_REQUEST_TEMPLATE.md` renamed away | 01 | missing: .github/PULL_REQUEST_TEMPLATE.md |

### 2. Validated statically only

- The five workflows: actionlint (syntax, expressions, shellcheck, the injection rule). Nothing has run on GitHub.
- `dependabot.yml`: JSON-schema valid. Whether GitHub accepts `cooldown`, the `routine` group and the ignores is only confirmed by the Dependabot page after the first push (the schema lists all three).
- `codeql.yml`, the `dependency-review` job, `config.yml` link: structure only.
- The full `secrets.yml` step as one unit (see deviation 1): its pieces were run, not the assembled step.

### 3. Cannot be verified until the owner pushes to GitHub

Whether the jobs pass on a runner (`frontend`, `backend`, `audit`, `gitleaks`, `analyze`), whether `pr-title` fails on a bad title and passes after an edit, whether `dependency-review` works (dependency graph must be on), Dependabot's first pull requests (one per app, `chore:` titles, no duplicates), CodeQL results, push protection, and branch protection. `docs/standards/github-settings.md` lists each check.

## Owner actions still open, in order

1. Create the GitHub repository (public assumed), add the remote, push `main`.
2. Fill the owner-input placeholders: the security contact in `SECURITY.md` and the conduct contact in `CODE_OF_CONDUCT.md` (`pnpm verify:foundation` lists them as WARN). Decide about the second NOTE in the Covenant text (plan 01-09).
3. Settings -> Actions -> General: workflow permissions read-only.
4. Settings -> Advanced Security: dependency graph, Dependabot alerts and security updates, secret scanning, push protection, private vulnerability reporting; leave CodeQL default setup off.
5. Settings -> General -> Pull Requests: squash merging only, default squash message = pull request title, delete head branches on merge.
6. Open a throwaway pull request titled `Bad title`; confirm `pr-title` fails; retitle it `chore: test title check`; confirm it passes; let all workflows run once.
7. Branch protection (or ruleset) for `main`: pull request required, one approving review, the seven required checks (`frontend`, `backend`, `pr-title`, `analyze`, `dependency-review`, `gitleaks`, `audit`), no force push, no deletion. Decide how a single maintainer satisfies the approval rule.
8. Run the "After the first push" list: Actions green, Dependabot page, CodeQL run, push protection test, the issue-chooser security link, the first Monday scheduled runs.
9. If the repository will be private, read "If the repository is private" first (CodeQL, dependency review, secret scanning need GitHub Advanced Security).
10. Later: remove the `GHSA-vfj7-8cjw-p6xm` ignore and the two `minimumReleaseAgeExclude` lines when their conditions are met (`docs/standards/security.md`).

## Actions and images referenced

| Reference | Confirmed how |
| --- | --- |
| `actions/checkout@v7` | `git ls-remote --tags` shows `v7` and `v7.0.1` |
| `actions/setup-node@v7` | `git ls-remote --tags` shows `v7` and `v7.1.0` |
| `pnpm/action-setup@v6` | `git ls-remote --tags` shows `v6` and `v6.1.0` |
| `github/codeql-action/init@v4`, `analyze@v4` | `git ls-remote --tags` shows `v4` and `v4.38.2` |
| `actions/dependency-review-action@v5` | `git ls-remote` shows branch `v5` and tag `v5.0.0` |
| `ghcr.io/gitleaks/gitleaks:v8.30.1` | image pulled and run locally; same tag as the hook |
| `postgres:18-alpine` | same image as `compose.yaml`, used by the earlier plans |
| `rhysd/actionlint:latest` (local only, not in any workflow) | unpinned on purpose; run once with a read-only mount (digest `sha256:b1934ee5...`, actionlint 1.7.12) |

Version tags are not commit SHAs; Dependabot's `github-actions` entry keeps them current and SHA pinning stays an owner option.

## Planner assumptions kept visible

- Both apps always run, no path filters (D-18 against CI-01); recorded in `ci.yml`, `security.md` and `github-settings.md`.
- The repository is assumed public; the private case is documented.
- `pr-title` is skipped for Dependabot pull requests; Dependabot titles are forced to `chore:`.
- No security check is advisory; the verifier fails on `continue-on-error`.
- SEC-04 read as: private channel, what to include, no public issue; no response time promised.
- The security contact is the token `[OWNER TO SET: security contact]`; no personal address was used anywhere.

## Task Commits

1. **Task 1: CI, pull request title check and templates** - `c0f3679` (ci)
2. **Task 2: CodeQL, Dependabot, secret scan, audit gate, SECURITY.md, security notes** - `aa91337` (ci)
3. **Task 3: Owner settings checklist and the foundation verifier** - `e0e5914` (chore)

**Plan metadata:** the commit that adds this file (docs).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The CI secret scan could pass without scanning, and the `git` subcommand could not be run here**
- **Found during:** Task 2
- **Issue:** The planned `docker run ... gitleaks git` over a mounted checkout fails open when git cannot read the repository (shown above: `0 commits scanned`, `no leaks found`, exit 0). In a normal runner checkout that should not happen, but a safe-directory or shallow-checkout problem would look identical to a clean scan. Separately, the sandbox for this run refuses to execute `docker ... git ...` (it reads the `git` operand as a git command), so the plan's `git` subcommand form could not be tested at all.
- **Fix:** `secrets.yml` refuses a shallow checkout, computes the number of commits that have a diff with `git log -p ... | awk`, runs the pinned image read-only with `safe.directory` set through environment variables, requires exit status 0, and requires gitleaks' "N commits scanned" to equal the host count. It uses the image's `detect --source` subcommand, which scans the same history and which I could run and compare (48 equal 48). Documented in `docs/standards/security.md`. The plan says "with its git subcommand"; this differs only in the subcommand word.
- **Files modified:** `.github/workflows/secrets.yml`, `docs/standards/security.md`
- **Commit:** `aa91337`
- **Not proven:** the assembled step was not executed (the sandbox also refuses to run a shell script that contains these commands). Each part was run on its own and the fail-open case was reproduced; the first full run is on GitHub. If the count ever differs for a harmless reason (an unusual empty or binary-only commit), the job fails loudly, which is the safe direction.

**2. [Rule 2 - Missing critical] The audit allow-list is not empty**
- **Found during:** Task 2
- **Issue:** The plan says the allow-list table starts empty, but `frontend/pnpm-workspace.yaml` already carries the owner-accepted `GHSA-vfj7-8cjw-p6xm` ignore, and the plan's own prohibition forbids an ignore without a dated row in `docs/standards/security.md`.
- **Fix:** One row, dated 2026-10-08 as accepted, review by 2027-01-08 (my choice of date; adjust freely).
- **Files modified:** `docs/standards/security.md`
- **Commit:** `aa91337`

### Additions beyond the plan (small, all reviewable)

- Dependabot: `cooldown.default-days: 2` on the npm entries (the research pitfall and the instruction not to break Dependabot lockfile PRs with `minimumReleaseAge`), and an ignore for `@types/node` majors (it must follow the Node pin). Both validated against the schema; GitHub behaviour unconfirmed.
- `ci.yml` drift steps diff the one generated file (`git diff --exit-code -- <file>`) instead of the whole tree.
- `audit.yml`: the backend audit step uses `if: ${{ !cancelled() }}` so one run reports both apps.
- Verifier check 06 also requires `CONTRIBUTING.md` to mention every commit type; check 09 also requires a read-only top-level token in every workflow; check 11 requires the scan-count comparison to be present.
- `config.yml` carries the security contact link as the relative path `../../../security/policy` (the plan asked for a relative GitHub path). Whether GitHub resolves a relative `url` is unverified; the bug form also tells reporters not to use a public issue, and the checklist has a step to confirm or replace the link.
- The phase gate says `docker compose down -v && docker compose up -d --wait`; I ran `up -d --wait` without removing volumes (they belong to the shared `opencrm` project and earlier plans documented keeping them), then `down` without `-v`.

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical) plus the additions above. **Impact:** none on scope; deviation 1 changes the gitleaks subcommand word and adds a guard, deviation 2 adds one table row.

## Issues Encountered

- The sandbox rejected several command shapes (docker with a `git` operand, `git` in loops, piped input to `npx`, running `bash <file>`); each was split into plain commands or replaced by a redirect from a file. Nothing was worked around by hiding a refused command in a script.
- Hooks: the first `pnpm install` in this worktree already ran `prepare` and set `core.hooksPath` to `.husky/_` in the shared repository config (it had been an absolute path to the main checkout). Commits ran lint-staged ("no staged files matching" for root-only changes), the gitleaks scan and commitlint, and all three were accepted.
- Host Node 25.6.0 prints the expected engine warning; host pnpm is 10.3.0, so every command ran as `npx pnpm@11.28.5`. `pnpm --dir <app> ...` still does not work on pnpm 10 (plan 01-08 deviation 3); the CI jobs use the pinned pnpm 11 with a working directory instead.
- The frontend `vitest` Vite warning about `"type": "module"` was not seen in the tail of the output; the open owner decision from plan 01-06 is unchanged and `package.json` was not touched.

## Known Stubs

None. The only placeholders are the two owner-input tokens (`SECURITY.md`, `CODE_OF_CONDUCT.md`), reported as WARN by the verifier.

## Threat Surface

T-10-01: `PR_TITLE` and `BASE_SHA`/`HEAD_SHA` only through `env`; actionlint and verifier check 09 both fail on an inlined title (proven). T-10-02: every workflow has a top-level `contents: read`, checked by the verifier; only `analyze` adds `security-events: write`. T-10-03: version-tag pins, Dependabot github-actions entry, pinned gitleaks tag compared by check 11. T-10-04: audit on push, pull request and weekly, dependency review; threshold proven to gate. T-10-05: history-wide gitleaks with a scan-count guard, plus the owner checklist for push protection. T-10-06: no address anywhere, check 14. T-10-07: no path filters, stable job ids, listed in the checklist. T-10-08: actionlint run once, read-only mount. No new threat flags.

## Needs a human

- Everything in "Owner actions still open".
- Review `docs/standards/security.md` and `docs/standards/github-settings.md` for tone; they were written for the owner.
- Decide the single-maintainer approval rule and whether the repository is public.

## Next Phase Readiness

Phase 1 foundation files are complete. Phase 2 can rely on `pnpm verify:foundation` and the seven required checks once the owner has pushed and applied the settings.

---
*Phase: 01-repository-foundation-standards*
*Completed: 2026-10-08*

## Self-Check: PASSED

All fourteen created files exist on disk; commits `c0f3679`, `aa91337` and `e0e5914` are in `git log`; actionlint, the verifier (14 of 14), `pnpm test:commitlint`, `pnpm test:secret-hook` and both audits were re-run against the committed content; the Compose stack was started, probed and stopped, and `git status` was clean.
