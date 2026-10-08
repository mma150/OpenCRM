---
phase: "2"
slug: "authentication-users-app-shell"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-08"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.3 in both apps; supertest 7.3.1 + real `opencrm_test` PostgreSQL (backend); Testing Library 16.3.3 + jest-dom + jsdom (frontend) |
| **Config file** | `backend/vitest.config.ts`, `frontend/vitest.config.ts`, `frontend/vitest.setup.ts` (exist) |
| **Quick run command** | `pnpm --dir backend exec vitest run src/modules/auth` / `pnpm --dir frontend exec vitest run src/features/auth` |
| **Full suite command** | `pnpm --dir backend check && pnpm --dir backend test && pnpm --dir frontend check && pnpm --dir frontend test && pnpm --dir frontend build` |
| **Estimated runtime** | ~30 seconds per task sample; full suite longer |

Backend tests need PostgreSQL: run `docker compose up -d --wait db` first (`docs/standards/testing.md`).

---

## Sampling Rate

- **After every task commit:** Run the app's `check` plus the test file(s) touched (`pnpm --dir <app> exec vitest run <path>`)
- **After every plan wave:** Run `pnpm --dir backend check && pnpm --dir backend test`, `pnpm --dir frontend check && pnpm --dir frontend test`, then regenerate OpenAPI and API types and run `git diff --exit-code` on both generated files
- **Before `/gsd-verify-work`:** Full suite must be green, both builds green, `pnpm audit --audit-level=high` clean in both apps
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Task IDs are filled in by the planner. The requirement-level map below comes from `02-RESEARCH.md` § Validation Architecture.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | AUTH-04 | — | First visitor creates Admin; second attempt `SETUP_CLOSED`; concurrent setups create one user | integration | `pnpm --dir backend exec vitest run src/modules/auth/auth.test.ts -t setup` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-01 | — | Wrong email and wrong password return identical body; lock after 10 failures, clears after 15 min | integration | `pnpm --dir backend exec vitest run src/modules/auth/auth.test.ts -t login` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-02 | — | Cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`; logout and expiry return 401 | integration | `pnpm --dir backend exec vitest run src/modules/auth/auth.test.ts -t session` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-03 | — | Forgot always 200 generic; token single-use, 1 h expiry; reset clears lock and all sessions | integration | `pnpm --dir backend exec vitest run src/modules/auth/auth.test.ts -t reset` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-05 | — | Profile edit accepts name only (`role` rejected); change-password keeps current session, deletes others | integration | `pnpm --dir backend exec vitest run src/modules/auth/auth.test.ts -t profile` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-01..05 (D-05) | — | Password length 10..128 and blocklist enforced on all four entry points | unit + integration | `pnpm --dir backend exec vitest run src/lib/password.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ROLE-01 | — | Invite, edit, deactivate (sessions gone, login blocked), reactivate; duplicate email `EMAIL_IN_USE` | integration | `pnpm --dir backend exec vitest run src/modules/users/users.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ROLE-02 | — | Exactly one of four roles; last admin cannot be demoted or deactivated (`LAST_ADMIN`) | integration | `pnpm --dir backend exec vitest run src/modules/users/users.test.ts -t role` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ROLE-03 | — | Manager assignment is rep-only, active manager only, cleared on role change | integration | `pnpm --dir backend exec vitest run src/modules/users/users.test.ts -t manager` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ROLE-01..03 | — | Non-admin and anonymous callers get 403/401 on every `/users` route | integration | `pnpm --dir backend exec vitest run src/modules/users/users.test.ts -t access` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SEC-05 | — | helmet headers; CORS allow-list; disallowed Origin 403; 429 `RATE_LIMITED` with `Retry-After`; 413 on oversized body | integration | `pnpm --dir backend exec vitest run src/middleware` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SEC-05 | — | Every registered route returns 400 `VALIDATION_FAILED` for bad input and 401 when unauthenticated | integration (contract) | `pnpm --dir backend exec vitest run src/middleware/endpoint-contract.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SEC-05 | — | New paths and error codes present in `openapi.json`; drift test passes | drift | `pnpm --dir backend test` | ✅ | ⬜ pending |
| TBD | TBD | TBD | UI-02, UI-03 | — | N/A | component | `pnpm --dir frontend exec vitest run src/components` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-01, AUTH-02 | — | Login form maps error codes to messages; `?next=` rejects `//evil`; 401 handling redirects | component + slice | `pnpm --dir frontend exec vitest run src/features/auth src/lib/api` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ROLE-01..03 | — | Non-admin sees no access to the Users screen | component | `pnpm --dir frontend exec vitest run src/features/users` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/test/helpers.ts` — `resetDatabase()`, `createUser()`, `loginAs()`, `captureMail()`
- [ ] `backend/src/lib/password.test.ts`, `backend/src/lib/mailer.test.ts`
- [ ] `backend/src/modules/auth/auth.test.ts`, `backend/src/modules/users/users.test.ts`
- [ ] `backend/src/middleware/security.test.ts`, `backend/src/middleware/endpoint-contract.test.ts`
- [ ] Update `error-handler.test.ts` and `openapi.test.ts` for the new error-code list
- [ ] `frontend/src/test/render-with-store.tsx` helper and the feature and component tests listed above
- [ ] No framework install needed (Vitest and Testing Library already present)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No horizontal page scroll; bottom tab bar does not cover content; dark mode readable | UI-01 | jsdom does not apply Tailwind/CSS and the stack has no browser test runner | Open login, profile and user management at 375, 768 and 1280 px; check the bottom tab bar and "More"; switch Light / Dark / System |
| Invite and reset emails arrive | AUTH-03, ROLE-01 | Needs the running mail catcher | `docker compose up`, invite a user, read the email at `http://localhost:8025` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
