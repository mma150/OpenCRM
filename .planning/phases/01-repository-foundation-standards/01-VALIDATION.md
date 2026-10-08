---
phase: 1
slug: repository-foundation-standards
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-08
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.3 on both apps; supertest 7.3.1 (backend); Testing Library 16.3.3 + jest-dom 7.0.1 + jsdom 30.1.2 (frontend) |
| **Config file** | none — Wave 0 installs (`backend/vitest.config.ts`, `frontend/vitest.config.ts`, `frontend/vitest.setup.ts`) |
| **Quick run command** | `pnpm --dir backend test` / `pnpm --dir frontend test` |
| **Full suite command** | per app `pnpm check && pnpm test && pnpm build`, plus root `node scripts/verify-foundation.mjs` and `pnpm test:commitlint` |
| **Estimated runtime** | ~30 seconds per app once dependencies are installed (backend tests need the Postgres container up) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --dir <app> check` and `pnpm --dir <app> test` for the touched app
- **After every plan wave:** Run both apps' `check && test && build`, root `node scripts/verify-foundation.mjs`, `pnpm test:commitlint`, and `pnpm audit --audit-level=high` per app
- **Before `/gsd-verify-work`:** Full suite must be green, plus `docker compose up -d --wait` smoke from a clean volume and the human-verify items (GitHub settings, first CI run, Dependabot/CodeQL visible)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Task IDs are `{plan}-T{task}` (for example `01-02-T1` is plan 01-02, task 1). A requirement delivered by several tasks lists each one. "File Exists" names the task that creates the test or script the command needs (the Wave 0 dependency).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T1, 01-09-T1, 01-10-T3 | 01, 09, 10 | 1, 7, 8 | FND-01 | T-01-SC | No package installed before owner approval | repo check | `node scripts/verify-foundation.mjs` | ❌ created by 01-10-T3 | ⬜ pending |
| 01-08-T1, 01-09-T2, 01-09-T3 | 08, 09 | 7 | FND-02 | T-09-03 | N/A | repo check | `node scripts/verify-foundation.mjs` | ❌ created by 01-10-T3 | ⬜ pending |
| 01-04-T1, 01-06-T1 | 04, 06 | 4 | FND-03 | T-04-02 | Layering and Redux-pattern violations fail lint | script | `pnpm --dir backend check` and `pnpm --dir frontend check` | ❌ created by 01-04-T1, 01-06-T1 | ⬜ pending |
| 01-02-T1, 01-03-T1, 01-03-T2 | 02, 03 | 2, 3 | FND-04 | T-02-03 | Database port bound to 127.0.0.1 only | smoke | `docker compose up -d --wait && curl -fsS localhost:${API_PORT:-4000}/api/v1/health && curl -fsS localhost:${WEB_PORT:-3000}` | ❌ created by 01-02-T1, 01-03-T1 | ⬜ pending |
| 01-03-T1, 01-06-T3, 01-07-T2 | 03, 06, 07 | 3, 4, 6 | FND-05 | T-06-03 | Only one HTTP client; typed hooks only | unit/component | `pnpm --dir frontend test` | ❌ created by 01-06-T3 | ⬜ pending |
| 01-02-T1, 01-04-T2, 01-05-T1 | 02, 04, 05 | 2, 4, 5 | FND-06 | T-05-01 | Error responses carry no stack trace | integration | `pnpm --dir backend test` | ❌ created by 01-04-T2 | ⬜ pending |
| 01-05-T2, 01-07-T2 | 05, 07 | 5, 6 | FND-07 | T-07-02 | N/A | integration + drift | `pnpm --dir backend test` and `pnpm --dir backend openapi:generate && git diff --exit-code -- backend/openapi/openapi.json` | ❌ created by 01-05-T2 | ⬜ pending |
| 01-02-T1, 01-04-T2, 01-06-T2 | 02, 04, 06 | 2, 4 | FND-08 | T-02-06 | Missing or invalid env stops startup and names the variable | unit + repo check | `pnpm --dir backend test` and `node scripts/verify-foundation.mjs` | ❌ created by 01-04-T2 | ⬜ pending |
| 01-09-T1 | 09 | 7 | CTB-01 | T-09-02 | Licence text unmodified | repo check | `node scripts/verify-foundation.mjs` | ❌ created by 01-10-T3 | ⬜ pending |
| 01-10-T1 | 10 | 8 | CTB-02 | — | N/A | repo check | `node scripts/verify-foundation.mjs` | ❌ created by 01-10-T3 | ⬜ pending |
| 01-08-T1 | 08 | 7 | CTB-03 | — | N/A | repo check | `node scripts/verify-foundation.mjs` | ❌ created by 01-10-T3 | ⬜ pending |
| 01-08-T1, 01-08-T3 | 08 | 7 | CTB-04 | T-08-03 | Bad commit message is rejected | script | `pnpm test:commitlint` | ❌ created by 01-08-T1 | ⬜ pending |
| 01-09-T1, 01-10-T3 | 09, 10 | 7, 8 | CTB-05 | T-10-07 | N/A | repo check | `node scripts/verify-foundation.mjs` | ❌ created by 01-10-T3 | ⬜ pending |
| 01-10-T1 | 10 | 8 | CI-01 | T-10-02 | Workflow token is read-only by default | static + post-push | `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W 2>/dev/null \|\| pwd):/repo:ro" -w /repo rhysd/actionlint:latest` | n/a (container image) | ⬜ pending |
| 01-10-T1 | 10 | 8 | CI-02 | T-10-01 | PR title is passed through `env:`, never inlined in a script | script + post-push | `printf 'Bad title\n' \| pnpm exec commitlint` exits non-zero | ❌ created by 01-08-T1 | ⬜ pending |
| 01-10-T2 | 10 | 8 | SEC-01 | T-10-04 | Dependency updates and alerts are configured | static + post-push | `node scripts/verify-foundation.mjs` | ❌ created by 01-10-T3 | ⬜ pending |
| 01-10-T2 | 10 | 8 | SEC-02 | T-10-03 | CodeQL runs on `pull_request` and `schedule` | static + post-push | `node scripts/verify-foundation.mjs` | ❌ created by 01-10-T3 | ⬜ pending |
| 01-08-T2, 01-08-T3, 01-10-T2 | 08, 10 | 7, 8 | SEC-03 | T-08-01 | Staged secret is blocked locally | script | `pnpm test:secret-hook` | ❌ created by 01-08-T2 | ⬜ pending |
| 01-10-T2 | 10 | 8 | SEC-04 | T-10-06 | No personal contact data published | repo check | `node scripts/verify-foundation.mjs` | ❌ created by 01-10-T3 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/vitest.config.ts` + `globalSetup` — creates `opencrm_test` and runs `prisma migrate deploy` (task 01-04-T2)
- [ ] `frontend/vitest.config.ts` + `frontend/vitest.setup.ts` (task 01-06-T3)
- [ ] `scripts/verify-foundation.mjs` — file and heading presence, `.env.example` vs Zod keys drift, `.nvmrc` = Dockerfile `NODE_VERSION` = `engines`, documented commit types = commitlint list (task 01-10-T3)
- [ ] `test:commitlint` fixtures — good: `feat: add lead list`, `fix(api): handle null`; bad: capital subject, missing type, 73 characters, attribution trailer (task 01-08-T1)
- [ ] `test:secret-hook` — scripted staged-credential run in a temporary repository (task 01-08-T2)
- [ ] Framework install — Vitest, supertest, Testing Library, jsdom, pinned in plan 01-01 and installed after the owner approves the manifests (tasks 01-04-T1, 01-06-T1)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GitHub Actions run green for both apps | CI-01 | No GitHub remote exists yet | Push to GitHub, open the Actions tab, confirm the frontend and backend jobs pass |
| PR with a bad title fails CI | CI-02 | Needs a real pull request | Open a throwaway PR titled `Bad title`, confirm the `pr-title` check fails |
| Dependabot is active | SEC-01 | GitHub-side setting | Insights → Dependency graph → Dependabot shows the configured ecosystems |
| CodeQL runs on PR and schedule | SEC-02 | Needs a real workflow run | Confirm the first CodeQL run appears under Security → Code scanning |
| Push protection blocks a committed secret | SEC-03 | Owner must enable it in repository settings | Enable secret scanning and push protection, confirm the CI `gitleaks` job runs |
| Branch protection for `main` | CTB-05 | Repository setting, not a file | Apply the checklist in `docs/standards/github-settings.md` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
