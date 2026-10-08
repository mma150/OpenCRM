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

Task IDs are assigned by the planner; rows are keyed by requirement until plans exist.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | FND-01 | — | N/A | repo check | `node scripts/verify-foundation.mjs` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-02 | — | N/A | repo check | `node scripts/verify-foundation.mjs` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-03 | — | N/A | script | `pnpm --dir backend check` and `pnpm --dir frontend check` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-04 | — | N/A | smoke | `docker compose up -d --wait && curl -fsS localhost:4000/api/v1/health && curl -fsS localhost:3000` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-05 | — | N/A | unit/component | `pnpm --dir frontend test -- health` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-06 | — | Error responses carry no stack trace | integration | `pnpm --dir backend test -- health` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-07 | — | N/A | integration + drift | `pnpm --dir backend test -- openapi` and `pnpm --dir backend openapi:generate && git diff --exit-code` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FND-08 | — | Missing or invalid env stops startup and names the variable | unit + repo check | `pnpm --dir backend test -- env` and `node scripts/verify-foundation.mjs` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CTB-01 | — | N/A | repo check | `node scripts/verify-foundation.mjs` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CTB-02 | — | N/A | repo check | `node scripts/verify-foundation.mjs` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CTB-03 | — | N/A | repo check | `node scripts/verify-foundation.mjs` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CTB-04 | — | Bad commit message is rejected | script | `pnpm test:commitlint` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CTB-05 | — | N/A | repo check | `node scripts/verify-foundation.mjs` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CI-01 | — | N/A | static + post-push | `docker run --rm -v "$(pwd -W):/repo" -w /repo rhysd/actionlint:latest` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CI-02 | — | PR title is passed through `env:`, never inlined in a script | script + post-push | `printf 'Bad title\n' \| pnpm exec commitlint` exits non-zero | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SEC-01 | — | Dependency updates and alerts are configured | static + post-push | `node scripts/verify-foundation.mjs` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SEC-02 | — | CodeQL runs on `pull_request` and `schedule` | static + post-push | `node scripts/verify-foundation.mjs` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SEC-03 | — | Staged secret is blocked locally | script | scripted hook run against a fake token in a temp repo exits non-zero | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SEC-04 | — | N/A | repo check | `node scripts/verify-foundation.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/vitest.config.ts` + `globalSetup` — creates `opencrm_test` and runs `prisma migrate deploy`
- [ ] `frontend/vitest.config.ts` + `frontend/vitest.setup.ts`
- [ ] `scripts/verify-foundation.mjs` — file and heading presence, `.env.example` vs Zod keys drift, `.nvmrc` = Dockerfile `NODE_VERSION` = `engines`, documented commit types = commitlint list
- [ ] `test:commitlint` fixtures — good: `feat: add lead list`, `fix(api): handle null`; bad: capital subject, missing type, 73 characters, attribution trailer
- [ ] Framework install — Vitest, supertest, Testing Library, jsdom (no framework exists yet)

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
