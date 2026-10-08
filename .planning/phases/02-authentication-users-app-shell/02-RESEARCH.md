# Phase 2: Authentication, Users & App Shell - Research

**Researched:** 2026-10-08
**Domain:** Cookie-session authentication, user/role administration, API hardening (Express 5 + Prisma 7 + PostgreSQL), and the first shared UI set / responsive app shell (Next.js 16 + Redux Toolkit + shadcn/ui radix-nova + Tailwind 4)
**Confidence:** HIGH on repo integration points and security design, MEDIUM on three freshly released library versions (nodemailer 10.x, @node-rs/argon2 2.2.x, react-hook-form 7.8x)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Sessions & login rules**
- **D-01:** Logins are server-side sessions stored in PostgreSQL, carried by an httpOnly cookie in the browser. No JWT access/refresh tokens. Logout and deactivation must end a session immediately. The design must leave room for the later Flutter app to use the same sessions with a token header. - **Reversibility:** costly - the web client, the API auth middleware and the later mobile client are all written against this session model; switching to JWT means changing every authenticated request path.
- **D-02:** A session lasts 30 days and is renewed on use (sliding expiry). After 30 days without activity the user signs in again. No "Remember me" checkbox.
- **D-03:** A user may be signed in on any number of devices at once; each device has its own session. No session-list screen in this phase.
- **D-04:** Repeated wrong passwords are handled two ways together: auth routes are rate-limited (per address and per email, refused for a few minutes with a clear message), AND the account itself is locked temporarily after about 10 consecutive wrong passwords, for 15 minutes. The lock clears on its own; no Admin unlock is needed. The owner chose this over the recommended rate-limit-only option and accepts that someone who knows an email can lock that person out for 15 minutes.
- **D-05:** Password rule is length only: at least 10 characters, no forced character classes, and very common passwords are rejected. The same rule applies at setup, invite acceptance, reset and change.
- **D-06:** Changing a password keeps the current device signed in and ends every other session of that user. Resetting a password from an emailed link ends all of that user's sessions; they sign in fresh.
- **D-07:** First run: while no user exists, the app shows a one-time "Create the Admin account" page (name, email, password). Once the first user exists, that page and its API route are closed permanently. No setup token and no env/CLI bootstrap.
- **D-08:** Login and forgot-password never reveal whether an email has an account: wrong email and wrong password give the same "Email or password is incorrect" message, and forgot-password always answers "If that email exists, we sent a link". A deactivated user sees a distinct "account deactivated" message only after entering the correct password.

**Invites & email delivery**
- **D-09:** An Admin invites a user by entering name, email and role. The user receives an emailed link and sets their own password; the Admin never knows it. The account shows as "Invited" until the link is used. Admins do not set temporary passwords.
- **D-10:** The app never blocks on missing email. If SMTP is not configured, an invite still succeeds and the Admin is shown a copyable link to pass on by other means; an Admin can likewise generate a reset link for a user. A banner tells Admins that outgoing email is off. When SMTP is configured, the link is emailed and not shown.
- **D-11:** Invite links are valid for 7 days, password-reset links for 1 hour. Both are single-use. An Admin can resend an invite, which cancels the earlier link.
- **D-12:** Outgoing mail in this phase is configured by environment variables (the in-app SMTP settings screen is Phase 8). Local development adds a mail-catcher service (e.g. Mailpit) to the Compose stack so every email appears in a local web inbox and nothing leaves the machine. The mailer must be reusable by Phase 6 reminder emails.

**App shell & navigation**
- **D-13:** Navigation is a left sidebar with module links plus a top bar holding the user menu on desktop and tablet; on phones the sidebar is replaced by a bottom tab bar showing the most used sections plus "More". The owner chose this over the recommended slide-in drawer. - **Reversibility:** costly - every later module adds its entry to both the sidebar and the bottom-tab/More navigation, and page layouts reserve space for the bottom bar on phones.
- **D-14:** After signing in, every user lands on a simple Home page: a greeting by name, their role, and shortcuts to what exists (Profile; Users for Admins). Phase 6 replaces its content with the real dashboard, so the route and nav item are created now.
- **D-15:** The app has light and dark themes. Design tokens are defined for both now; the app follows the device setting by default and the user menu offers a Light / Dark / System switch.
- **D-16:** Lists are a table with columns on desktop and tablet, and stacked cards on phones (for Users: name, role, status, actions menu), with no sideways scroll at any width. This is the single list pattern every later module copies. - **Reversibility:** costly - Leads, Contacts, Opportunities and Tasks lists in Phases 3-6 are all built on this pattern.

**Teams & user rules**
- **D-17:** A team is not a separate record. Each user has one optional "Manager" field pointing at a user with the Sales Manager role; a manager's team is everyone who reports to them. A rep has at most one manager. - **Reversibility:** costly - Phase 3's "managers see their team's records" rule and every later per-team figure read this one relationship; moving to named or many-to-many teams needs a data migration and a rewrite of those rules.
- **D-18:** The last active Admin cannot be deactivated or moved to another role, by themselves or by anyone else; the API refuses with a clear, coded error. An Admin cannot deactivate their own account.
- **D-19:** Deactivating a user ends all their sessions immediately and blocks sign-in and password reset. Their account and everything attributed to them is kept. Reactivating restores access with the same role and manager. Users are never deleted, and there is no delete action in this phase.
- **D-20:** Users edit their own name and password on the profile page. Email is shown there but only an Admin can change it, from the Users screen. No email-change confirmation flow.

### Claude's Discretion
- Exact rate-limit thresholds and windows on auth routes, and the exact wrong-password count for the temporary lock (about 10, 15 minutes is the agreed shape).
- Which sections appear as bottom tabs on phones versus under "More" (in this phase only Home, Users and Profile exist), and the tablet behaviour of the sidebar (full or collapsed to icons).
- Password hashing algorithm, session cookie attributes, CSRF protection approach and how session tokens are stored (must be compatible with D-01 and the security standards).
- The common-password check source and size (D-05).
- How tokens for invites and resets are generated and stored.
- Library choices: mailer, rate limiter, mail-catcher image, form handling, and which shadcn components make up the shared set.
- Whether forms open as pages or dialogs, and the wording of loading, empty and error states, provided they are consistent across login, profile and user management (UI-03).
- What happens to reps' Manager field when their manager is deactivated or changes role (a sensible, documented default is enough).
- What becomes of the Phase 1 status page once Home exists.

### Deferred Ideas (OUT OF SCOPE)
None raised by the owner - discussion stayed within phase scope. Options that were offered and declined, so they are not built in this phase: an active-sessions list on the profile page, a "Remember me" checkbox, Admin-set temporary passwords, permanent deletion of never-activated users, and self-service email change with confirmation.

(Also out of scope per the phase boundary: record-level visibility per role ROLE-04..08 (Phase 3), any CRM record screens, the real dashboard (Phase 6), in-app SMTP settings MAIL-01 (Phase 8), social login and two-factor authentication (v2).)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can log in with email and password | Argon2id via `@node-rs/argon2`; login order-of-checks (dummy-hash, lock, deactivated-after-password) in Pattern 2; two-bucket rate limit |
| AUTH-02 | Session persists across refresh, ends on logout | DB `Session` table, SHA-256-hashed random token, httpOnly cookie, sliding expiry; client `fetchMe` bootstrap in `AuthGate` (Pattern 3, 7) |
| AUTH-03 | Password reset via emailed link | `AuthToken` table (type `PASSWORD_RESET`, 1 h, single-use claim via `updateMany`); nodemailer + Mailpit; reset also clears lock and all sessions |
| AUTH-04 | First run creates initial Admin | `GET /auth/setup-status` + `POST /auth/setup` guarded by advisory-lock transaction (Pattern 4) |
| AUTH-05 | User can update own profile and password | `PATCH /auth/me` (strict schema: name only), `POST /auth/change-password` keeps current session, deletes others |
| ROLE-01 | Admin can invite, edit, deactivate, reactivate users | `users` module with `requireRole(ADMIN)`; invite link returned only when mail is off (D-10); last-admin guard under advisory lock |
| ROLE-02 | Admin assigns exactly one of four roles | Prisma `Role` enum (`ADMIN`, `SALES_MANAGER`, `SALES_REP`, `READ_ONLY`), single column on `User` |
| ROLE-03 | Admin assigns reps to a manager's team | Self-relation `User.managerId`; rules in "Teams" section (manager must be an active `SALES_MANAGER`; only `SALES_REP` may have one) |
| SEC-05 | Baseline hardening: headers, CORS allow-list, auth rate limit, validation everywhere | helmet (already), credentialed CORS + Origin check, `express-rate-limit` 8.7.0, `.strict()` Zod schemas, registry-driven endpoint contract test |
| UI-01 | Usable at phone/tablet/desktop, no horizontal page scroll | Shell + list-pattern specifics in Pattern 6 and pitfalls 9-11; manual UAT widths 375/768/1280 |
| UI-02 | One shared component set and design tokens | shadcn radix-nova components (list in Standard Stack) on the existing OKLCH token CSS; light + dark already defined in `globals.css` |
| UI-03 | Consistent lists, forms, empty/loading/error states | Shared `ResponsiveList`, `PageState` (Skeleton / Empty / Alert), `FormField` wrapper over shadcn `Field` + react-hook-form |
</phase_requirements>

## Summary

Phase 1 already shipped almost every cross-cutting seam this phase plugs into: `createApp()` with helmet and an array CORS allow-list, the `AppError` + `ERROR_CODES` envelope, a Zod-to-OpenAPI registry, Prisma 7 with the `pg` adapter (no models yet), Zod-validated `env.ts` in both apps, a single axios `http` instance, a store *factory*, and shadcn radix-nova with full light and dark OKLCH tokens (including `--sidebar-*`). Phase 2 therefore adds: two Prisma models plus a token table, an `auth` and a `users` backend module, a mailer, rate-limit and Origin-check middleware, and on the web a route-group split (`(auth)` and `(app)`), an auth slice with a session bootstrap, the app shell, and the first set of shared components.

The recommended auth design is deliberately boring and fits D-01: a 32-byte random token, stored hashed (SHA-256) in a `Session` row, sent as an httpOnly `SameSite=Lax` cookie *and* accepted as `Authorization: Bearer` (for the later Flutter client). Every request looks the session up in PostgreSQL (so logout and deactivation are immediate) and slides the expiry with a write throttled to once per hour. Passwords use Argon2id through `@node-rs/argon2` (PHC-string output, OWASP-minimum defaults, no install script). CSRF is handled by strict `Origin` verification on unsafe methods plus `SameSite=Lax` plus JSON-only bodies (OWASP calls Origin checks defence in depth, see Assumption A2). Invite and reset links use the same random-token-hashed-in-DB mechanism with an atomic single-use claim.

Three findings change what the planner might otherwise assume. (1) **nodemailer must be at least 10.0.13**: every release up to 10.0.12 carries a high-severity advisory (GHSA-4ffr-jq9g-5ffx) and the whole 9.x line is affected with no backport, so the repo's `pnpm audit --audit-level=high` CI gate would fail on anything older. (2) **The 401 interceptor must key on the error *code* `UNAUTHENTICATED`, not on HTTP 401**, because login failure and other 401s must not trigger "session expired" handling. (3) **Next.js 16 renamed middleware to `proxy.ts`, and the session cookie is set by the API origin**, so route protection must be a client-side `AuthGate` driven by `GET /auth/me`, not a Next proxy.

**Primary recommendation:** Build `auth` and `users` as normal Phase 1 modules (copy `health`), keep sessions/tokens/hashing in `backend/src/lib/`, use DB-backed sessions with hashed random tokens, add the new error codes in one plan that regenerates OpenAPI + frontend types, and treat the app shell (route groups, `AuthGate`, nav config consumed by both sidebar and bottom bar, `ResponsiveList`) as the contract later phases copy. Every new dependency needs the owner approval that `docs/standards/security.md` requires; group them in one approval checkpoint.

## Project Constraints (from CLAUDE.md)

Directives extracted from `D:/Milan/opencrm/.claude/CLAUDE.md` (same authority as locked decisions):

- **Tech stack fixed:** Next.js + Redux Toolkit (frontend), Node + Express + Prisma (backend). TypeScript on both. PostgreSQL via Prisma. Single organisation per installation. Apache-2.0.
- **Simple, readable code over clever abstractions;** a contributor must find a feature from the folder names (mirror rule: backend `modules/<x>` pairs with frontend `features/<x>`).
- **Responsive:** all web screens work on phone, tablet and desktop.
- **Commits:** short conventional subject line (`feat: add lead list`), no long bodies, **never** a `Co-Authored-By` or any AI attribution trailer on commits or pull requests (this overrides any default attribution instruction).
- **Security:** vulnerabilities tracked continuously in CI (so new dependencies must keep `pnpm audit --audit-level=high` green in both apps).
- **GSD workflow:** file edits happen through a GSD command (`/gsd-execute-phase` for this phase's plans).
- No project skills directory exists (`.claude/skills/` absent), so no skill rules apply.

Binding standards from Phase 1 that the plan must follow unchanged (all read this session): `docs/standards/backend.md` (module = routes/controller/service/schema/test, Zod parse in controller, envelope, `AppError`, no `process.env` outside `env.ts`), `docs/standards/frontend.md` (feature folders, thunk + `{data,status,error}` slice, typed hooks only, one axios instance, no RTK Query, route files thin), `docs/standards/security.md` (exact pins, owner approval for every dependency, `allowBuilds`, audit allow-list), `docs/standards/testing.md` (real `opencrm_test` DB, no mocking Prisma, no lint disabling in tests, files `*.test.ts(x)` beside code).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Credential check, lockout, session issue/revoke | API / Backend | Database | Only the API may decide identity; session state lives in PostgreSQL (D-01) |
| Session cookie set/clear, Bearer acceptance | API / Backend | - | Cookie is issued by the API origin; the browser only stores it (httpOnly, unreadable by JS) |
| Route protection (signed-in / Admin screens) | Browser / Client | API / Backend | Cookie belongs to the API host, so Next cannot see it reliably; client `AuthGate` decides what to render, **API is the real enforcement** (403/401) |
| Role enforcement (Admin-only routes) | API / Backend | Browser (hide nav) | UI hiding is cosmetic; `requireRole` middleware is authoritative (ROLE-08 precedent) |
| Password rule + common-password check | API / Backend | Browser (length hint) | Server authoritative; client repeats only the length rule for instant feedback |
| Invite/reset token generation, storage, redemption | API / Backend | Database | Random token, SHA-256 hash stored, atomic single-use claim |
| Outgoing email | API / Backend (`lib/mailer`) | Mailpit (dev) | Reusable by Phase 6; failures never block the request (D-10) |
| Rate limiting, CORS, Origin check, security headers | API / Backend | - | SEC-05 is an API requirement |
| First-run detection | API / Backend (`setup-status`) | Browser (redirect) | Browser asks the API whether any user exists |
| Theme (light/dark/system) | Browser / Client | - | Device preference + localStorage via next-themes; no server state (D-15) |
| App shell, nav, responsive list pattern | Browser / Client (Frontend) | - | Pure presentation; nav items filtered by role from the `me` payload |
| Last-admin and manager-validity invariants | API / Backend | Database | Must hold under concurrency, so enforced in a locked transaction in the service |

## Standard Stack

### Core (new dependencies for this phase)

All pinned exactly (no `^`/`~`). Versions below are what the registry showed on 2026-10-08; pins deliberately avoid the very newest release where the legitimacy gate flagged it "too-new".

**Backend (`backend/package.json`)**

| Library | Pin | Purpose | Why Standard |
|---------|-----|---------|--------------|
| `@node-rs/argon2` | `2.2.0` (2.2.1 acceptable; 2.2.2 is two days old) | Argon2id hash + verify, PHC string | OWASP's first-choice algorithm; defaults are exactly OWASP's minimum (m=19456, t=2, p=1); prebuilt per-platform binaries via `optionalDependencies`, so **no install script and no `allowBuilds` entry** [VERIFIED: npm registry; CITED: github.com/napi-rs/node-rs/tree/main/packages/argon2] |
| `nodemailer` | `10.0.14` (**minimum 10.0.13**) | SMTP sending | De-facto Node mailer, ships its own types (no `@types/nodemailer`), Node >= 20 [VERIFIED: npm registry, GitHub advisories API] |
| `express-rate-limit` | `8.7.0` | Per-IP and per-email limits on auth routes | Standard Express limiter; v8 has `ipKeyGenerator` for IPv6-safe custom keys; the IPv4-mapped-IPv6 bypass (CVE-2026-30827, GHSA-46wh-pxpv-q5gq) is fixed in every 8.x from 8.3.0 [VERIFIED: npm registry, GitHub advisories API] |
| `cookie-parser` | `1.4.7` | Read the session cookie into `req.cookies` | Express's own org package; Express 5 has `res.cookie()` but no cookie reader [VERIFIED: npm registry] |
| `@types/cookie-parser` (dev) | `1.4.10` | Types | - |

**Frontend (`frontend/package.json`)**

| Library | Pin | Purpose | Why Standard |
|---------|-----|---------|--------------|
| `react-hook-form` | `7.87.0` | Form state | shadcn's documented pattern for `Field` + `Controller`; peer `react` ^19 ok [VERIFIED: npm registry; CITED: ui.shadcn.com/docs/forms/react-hook-form] |
| `@hookform/resolvers` | `5.9.1` | `zodResolver` | Peer `zod` ^3.25 or ^4 matches the repo's zod 4.6.5; peer `react-hook-form` ^7.55 [VERIFIED: npm registry] |
| `next-themes` | `0.4.6` | Light/Dark/System with no flash | shadcn's documented dark-mode setup for Next; peers allow React 19 [VERIFIED: npm registry; CITED: ui.shadcn.com/docs/dark-mode/next] |
| `sonner` | `2.0.8` | Transient success toasts | The `sonner` component in the radix-nova registry declares exactly `sonner` + `next-themes` as dependencies [VERIFIED: ui.shadcn.com/r/styles/radix-nova/sonner.json] |

No new dependency is needed for: password blocklist (a data file, below), UUIDs (Prisma `uuid(7)`), sessions/tokens (`node:crypto`), CSRF (own ~15-line middleware), theme switch UI (shadcn dropdown).

### shadcn components to add (the shared set, UI-02)

Added with the locally installed CLI (`pnpm exec shadcn add ...`, per `frontend.md`); the radix-nova registry confirms each exists and that none adds an npm dependency except `sonner`:
`input`, `label`, `field`, `card`, `alert`, `badge`, `skeleton`, `spinner`, `empty`, `separator`, `avatar`, `table`, `dropdown-menu`, `dialog`, `alert-dialog`, `select`, `tooltip`, `sonner`. (`button` exists.) [VERIFIED: ui.shadcn.com/r/styles/radix-nova/registry.json item list; field/empty/spinner/table/dropdown-menu/alert-dialog JSON show only the already-installed `cn` dependency]

Do **not** add shadcn's `sidebar` component: its mobile mode is a slide-in `Sheet`, which is the pattern the owner rejected in D-13, and it pulls `sheet`, `use-mobile` and more. Build a small custom `AppSidebar` / `BottomTabBar` from Tailwind and the existing `--sidebar-*` tokens (they are already in `globals.css`).

### Supporting (infrastructure)

| Item | Pin | Purpose |
|------|-----|---------|
| Mailpit Docker image | `axllent/mailpit:v1.31.4` | Dev mail catcher: SMTP on 1025, web inbox on 8025, built-in healthcheck `/mailpit readyz` [VERIFIED: Docker Hub tag list 2026-10-03, GitHub releases; CITED: mailpit.axllent.org/docs/install/docker, dokploy template for readyz] |
| Common-password list | data file, ~108 KB | `backend/src/lib/common-passwords.txt`: SecLists `100k-most-used-passwords-NCSC.txt` filtered to length >= 10 = **9,307 entries** (MIT licence) [VERIFIED: downloaded and counted this session] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@node-rs/argon2` | Node built-in `crypto.argon2` (added v24.7.0) | Zero dependency, but `engines` allows Node 24.0-24.6 where it does not exist, and it returns raw bytes: you would hand-write the PHC encoding. Rejected [VERIFIED: nodejs.org/docs/latest-v24.x/api/crypto.html "Added in: v24.7.0"] |
| `@node-rs/argon2` | `argon2` 0.45.1 (node-argon2) | Legitimacy gate: OK. Needs a native build/prebuild install script, which means an `allowBuilds` entry in pnpm 11. Works, more friction [VERIFIED: legitimacy check] |
| `@node-rs/argon2` | `bcryptjs` / scrypt | Weaker GPU resistance / hand-rolled encoding. Rejected |
| `express-rate-limit` memory store | Postgres-backed store | A restart resets the counters (acceptable: single-process, self-hosted; account lock is in the DB and survives restarts). Revisit only if the API is ever run as several instances (A6) |
| Custom Origin-check CSRF | Synchronizer/double-submit token | OWASP treats Origin verification as defence in depth; a token is the textbook primary control. Origin + SameSite + JSON-only is simpler and fits a cookie+Bearer dual client; flagged as A2 for owner confirmation |
| react-hook-form | Plain controlled inputs + Zod | RHF is the shadcn-documented path and gives per-field `invalid` state for `Field`; plain forms mean more hand code across 8+ forms in this phase alone |
| `sonner` toasts | Inline `Alert` only | Toasts give the "Invite sent" / "Password changed" confirmation after a dialog closes. Inline `Alert` still used for persistent errors |

**Installation (after owner approval of the names, see Package Legitimacy Audit):**
```bash
# backend/   (exact pins; pnpm 11, minimumReleaseAge 1 day is satisfied by all of these)
pnpm add --save-exact @node-rs/argon2@2.2.0 nodemailer@10.0.14 express-rate-limit@8.7.0 cookie-parser@1.4.7
pnpm add --save-exact -D @types/cookie-parser@1.4.10

# frontend/
pnpm add --save-exact react-hook-form@7.87.0 @hookform/resolvers@5.9.1 next-themes@0.4.6 sonner@2.0.8
pnpm exec shadcn add input label field card alert badge skeleton spinner empty separator avatar table dropdown-menu dialog alert-dialog select tooltip sonner
```
After installing, run `pnpm audit --audit-level=high` in both apps; the frontend baseline already carries the owner-accepted `braces` ignore only. `@node-rs/argon2` needs no `allowBuilds` line; if pnpm reports otherwise, stop and tell the owner rather than adding one.

**Version verification (this session):** `npm view` returned `@node-rs/argon2` 2.2.2 (2026-10-06), `nodemailer` 10.0.16 (2026-10-07), `express-rate-limit` 8.7.1 (2026-10-06), `react-hook-form` 7.89.0 (2026-09-26), `@hookform/resolvers` 5.9.1, `next-themes` 0.4.6, `sonner` 2.0.8, `cookie-parser` 1.4.7. The pins above are the newest releases old enough to clear the legitimacy gate's "too-new" signal, except nodemailer, which is pinned at 10.0.14 because 10.0.13 is the first patched release for GHSA-4ffr-jq9g-5ffx. Re-run `npm view <pkg> time` at install time and take the newest release at least ~30 days old (nodemailer: newest >= 10.0.13).

## Package Legitimacy Audit

Run through `gsd-tools query package-legitimacy check --ecosystem npm ...` on 2026-10-08. The seam rates the *latest* release; `SUS` here is **only** the `too-new` signal on a fresh patch release of an established package (millions of weekly downloads, public source repo, no postinstall). Mitigation is pinning an older release; the security standard already requires owner approval before any install, so one approval checkpoint covers all rows.

| Package | Registry | Age / latest published | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|------------------------|-----------|-------------|---------|-------------|
| `@node-rs/argon2` | npm | latest 2026-10-06 | ~1.9M/wk | github.com/napi-rs/node-rs | SUS (too-new) | Keep, pin 2.2.0; `[WARNING: flagged as suspicious - verify before using.]` planner adds `checkpoint:human-verify` |
| `nodemailer` | npm | latest 2026-10-07 | ~29M/wk | github.com/nodemailer/nodemailer | SUS (too-new) | Keep, pin 10.0.14 (>= 10.0.13 mandatory); `[WARNING: flagged as suspicious - verify before using.]` checkpoint |
| `express-rate-limit` | npm | latest 2026-10-06 | ~82M/wk | github.com/express-rate-limit/express-rate-limit | SUS (too-new) | Keep, pin 8.7.0; `[WARNING: ...]` checkpoint |
| `react-hook-form` | npm | latest 2026-09-26 | ~70M/wk | github.com/react-hook-form/react-hook-form | SUS (too-new) | Keep, pin 7.87.0; `[WARNING: ...]` checkpoint |
| `cookie-parser` | npm | 2024-10-08 | ~14M/wk | github.com/expressjs/cookie-parser | OK | Approved |
| `@types/cookie-parser` | npm | 2025-10-24 | ~8.9M/wk | DefinitelyTyped | OK | Approved |
| `@hookform/resolvers` | npm | 2026-08-17 | ~59M/wk | github.com/react-hook-form/resolvers | OK | Approved |
| `next-themes` | npm | 2025-03-11 | ~33M/wk | github.com/pacocoursey/next-themes | OK | Approved |
| `sonner` | npm | 2026-08-09 | ~64M/wk | github.com/emilkowalski/sonner | OK | Approved |

**Packages removed due to SLOP verdict:** none.
**Packages flagged SUS:** `@node-rs/argon2`, `nodemailer`, `express-rate-limit`, `react-hook-form` (planner inserts `checkpoint:human-verify` before the install task; the same checkpoint satisfies the owner-approval rule in `docs/standards/security.md`).
**Names provenance:** every name above is either named in an authoritative source I fetched (shadcn docs for react-hook-form, @hookform/resolvers, next-themes; the shadcn radix-nova registry JSON for sonner and next-themes; the Node/Mailpit/OWASP docs for the rest) or is the ecosystem standard confirmed by the legitimacy seam. `@node-rs/argon2`, `nodemailer`, `express-rate-limit` and `cookie-parser` were chosen from training knowledge and confirmed by the seam, registry metadata and GitHub advisory data, so treat their selection as `[ASSUMED]` until the owner approves the names (Assumption A0).
**Advisory check (GitHub advisories API, this session):** nodemailer has a dozen advisories dated 2026-09, the latest requiring >= 10.0.13; express-rate-limit has one old IPv6 advisory fixed in 8.0.2/8.1.1/8.2.2/8.3.0; none returned for `@node-rs/argon2`, `cookie-parser`, `react-hook-form`, `next-themes`.

## Architecture Patterns

### System Architecture Diagram

```
 Browser (Next.js, (auth) + (app) route groups)
   |  axios `http` (withCredentials) -> 401 code UNAUTHENTICATED -> sessionExpired -> /login
   v
 [httpLogger] -> [helmet] -> [cors: allow-list + credentials] -> [origin-check (unsafe methods)]
   -> [cookie-parser] -> [express.json 100kb] -> /api/v1 [no-store cache header]
        |
        |-- public:  GET auth/setup-status | POST auth/setup | auth/login | auth/forgot-password
        |            auth/reset-password | auth/accept-invite     (each behind ip + email rate limiters)
        |
        |-- [authenticate]  token from cookie OR "Authorization: Bearer"
        |        sha256(token) -> Session JOIN User   -> 401 UNAUTHENTICATED if missing/expired/inactive
        |        slide expiresAt (write at most hourly) + re-send Set-Cookie
        |        sets req.auth = { user, sessionId }
        |
        |-- protected: GET/PATCH auth/me | POST auth/logout | auth/change-password
        |
        |-- [requireRole(ADMIN)]  -> /users/*  (list, invite, edit, deactivate, reactivate,
        |                                        resend-invite, password-reset-link)
        v
   controller (Zod .strict() parse) -> service -> Prisma ------> PostgreSQL
                                          |                      User / Session / AuthToken
                                          +--> lib/mailer (nodemailer) --> SMTP (Mailpit in dev)
                                                 `-> if SMTP unset: return link to the Admin (D-10)
 every thrown error -> errorHandler -> { error: { code, message, details } }
```

### Recommended Project Structure

```
backend/src/
├── env.ts                       + APP_URL, TRUST_PROXY, SESSION_COOKIE_SECURE, SMTP_*, MAIL_FROM
├── app.ts                       + cookie-parser, credentialed CORS, origin-check, no-store, json limit
├── lib/
│   ├── app-error.ts             + new codes (table below)
│   ├── password.ts              hash / verify / dummy-verify / policy (length + blocklist)
│   ├── common-passwords.txt     9,307 lines, lowercase, >= 10 chars
│   ├── tokens.ts                newToken() -> { token, tokenHash }; hashToken()
│   ├── mailer.ts                createTransport once; sendMail(); isMailConfigured()
│   └── session-cookie.ts        set / clear / read cookie, cookie name + attributes
├── middleware/
│   ├── authenticate.ts          resolves the session, attaches req.auth
│   ├── require-role.ts          requireRole(...roles)
│   ├── origin-check.ts          CSRF defence (see Pattern 5)
│   └── rate-limit.ts            createAuthLimiters(options) factory
├── modules/
│   ├── auth/    auth.{routes,controller,service,schema,test}.ts
│   └── users/   users.{routes,controller,service,schema,test}.ts
└── prisma/schema.prisma + migrations/<ts>_auth_users/

frontend/src/
├── app/
│   ├── layout.tsx               html, fonts, ThemeProvider, StoreProvider, Toaster (NO <main> wrapper any more)
│   ├── (auth)/layout.tsx        centered card shell; redirects signed-in users to /
│   ├── (auth)/{login,setup,forgot-password,reset-password,accept-invite}/page.tsx
│   ├── (app)/layout.tsx         <AuthGate><AppShell>…
│   ├── (app)/page.tsx           Home (route "/")      <- app/page.tsx moves here
│   ├── (app)/users/page.tsx     Admin only
│   ├── (app)/profile/page.tsx
│   └── status/page.tsx          Phase 1 health page, kept (A8)
├── components/
│   ├── ui/                      shadcn output (generated)
│   ├── app-shell/               app-shell.tsx, app-sidebar.tsx, bottom-tab-bar.tsx, top-bar.tsx,
│   │                            user-menu.tsx, nav-items.ts (single list, role-filtered)
│   └── shared/                  responsive-list.tsx, page-state.tsx, form-field.tsx, password-input.tsx
├── features/
│   ├── auth/   auth.{types,api,slice}.ts + login-form, setup-form, forgot-form, reset-form,
│   │           accept-invite-form, profile-page, change-password-form, auth-gate.tsx, tests
│   ├── users/  users.{types,api,slice}.ts + users-page, user-list, user-form-dialog,
│   │           invite-link-dialog, deactivate-dialog, tests
│   └── home/   home-page.tsx
├── lib/api/http.ts              + withCredentials, setUnauthenticatedHandler
└── store/index.ts               + auth, users reducers; root reducer reset on logout
```

### Pattern 1: Data model (Prisma 7, `prisma-client` generator already configured)

```prisma
// Source: design for this phase; syntax per prisma.io/docs/orm/reference/prisma-schema-reference
// (uuid(7) confirmed supported in the @default function list)
enum Role {
  ADMIN
  SALES_MANAGER
  SALES_REP
  READ_ONLY
}

enum AuthTokenType {
  INVITE
  PASSWORD_RESET
}

model User {
  id               String    @id @default(uuid(7))
  name             String
  email            String    @unique            // stored trimmed + lowercased by the Zod schema
  passwordHash     String?                      // null = invited, link not used yet
  role             Role
  isActive         Boolean   @default(true)
  managerId        String?
  manager          User?     @relation("Team", fields: [managerId], references: [id], onDelete: SetNull)
  reports          User[]    @relation("Team")
  failedLoginCount Int       @default(0)
  lockedUntil      DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  sessions         Session[]
  tokens           AuthToken[]

  @@index([managerId])
}

model Session {
  id         String   @id @default(uuid(7))
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash  String   @unique                   // sha256 hex of the random token; the token itself is never stored
  createdAt  DateTime @default(now())
  lastUsedAt DateTime @default(now())
  expiresAt  DateTime
  @@index([userId])
  @@index([expiresAt])
}

model AuthToken {
  id        String        @id @default(uuid(7))
  userId    String
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      AuthTokenType
  tokenHash String        @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime      @default(now())
  @@index([userId, type])
}
```

Derived account status (no stored status column): `!isActive` -> Deactivated; else `passwordHash == null` -> Invited; else Active. Reactivating a user who never accepted their invite returns them to Invited (the Admin resends). Users are never deleted, so no user FK needs a delete rule beyond `Session`/`AuthToken` cascade and the `manager` `SetNull`.

Migration: create it inside the container, as `docs/standards/backend.md` prescribes: `docker compose exec api pnpm exec prisma migrate dev --name auth_users`, commit the new `backend/prisma/migrations/` folder together with the schema. The container entrypoint already runs `prisma migrate deploy` on start, and `backend/test/global-setup.ts` migrates `opencrm_test`. [VERIFIED: docs/standards/backend.md "Creating the first migration (Phase 2)"; backend/docker/dev-entrypoint.sh]

### Pattern 2: Login service order of checks (AUTH-01, D-04, D-08)

```ts
// Source: design; argon2 API per github.com/napi-rs/node-rs/tree/main/packages/argon2 (hash/verify, PHC string, verify needs no options)
async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const user = await prisma.user.findUnique({ where: { email } });

  // 1. Unknown email or invited (no hash yet): burn the same CPU as a real check, same message.
  if (!user?.passwordHash) {
    await verifyDummyPassword(password);
    throw new AppError("INVALID_CREDENTIALS", 401, "Email or password is incorrect");
  }

  // 2. Locked: refuse BEFORE checking the password; do not extend the lock.
  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000);
    throw new AppError("ACCOUNT_LOCKED", 423, "Too many wrong passwords. Try again later.", { retryAfterSeconds });
  }
  // 3. An expired lock starts a fresh count (otherwise one wrong guess re-locks instantly).
  let failed = user.lockedUntil ? 0 : user.failedLoginCount;

  // 4. Check the password.
  if (!(await verifyPassword(user.passwordHash, password))) {
    failed += 1;
    await prisma.user.update({
      where: { id: user.id },
      data: failed >= LOCK_AFTER ? { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCK_MS) }
                                 : { failedLoginCount: failed, lockedUntil: null },
    });
    throw new AppError("INVALID_CREDENTIALS", 401, "Email or password is incorrect");
  }

  // 5. Correct password but deactivated: the distinct message is allowed only now (D-08).
  if (!user.isActive) throw new AppError("ACCOUNT_DEACTIVATED", 403, "This account has been deactivated");

  // 6. Success: reset counters, ALWAYS create a new session (never reuse an id: session fixation).
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  return createSession(user);
}
```

`LOCK_AFTER = 10`, `LOCK_MS = 15 * 60 * 1000` are named constants in the auth service (discretion area; "about 10, 15 minutes" is the agreed shape). The `ACCOUNT_LOCKED` response for a real account is the one intentional enumeration channel (the owner accepted lock-out griefing in D-04); the per-address limiter caps how fast an attacker can use it (Pitfall 12).

### Pattern 3: Session token + cookie (D-01, D-02, D-03)

```ts
// Source: design; OWASP Session Management Cheat Sheet (CSPRNG, >= 64 bits entropy; 256 bits used)
import { createHash, randomBytes } from "node:crypto";

export function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
```

- **Hash is SHA-256, not Argon2:** the token already has 256 bits of entropy, so a fast hash is correct and lets `findUnique({ where: { tokenHash } })` use the unique index. A database leak then does not hand out usable sessions.
- **Cookie** (set with Express 5 `res.cookie`): `httpOnly: true`, `sameSite: "lax"`, `secure: env.SESSION_COOKIE_SECURE`, `path: "/"`, `maxAge: 30 days`. Name `opencrm_session` (dev, http) / `__Host-opencrm_session` (production; the `__Host-` prefix requires `Secure`, `Path=/`, no `Domain`, which all hold because the API sets and receives it on its own host).
- **Accept the same token as `Authorization: Bearer <token>`** (cookie wins if both present). That is the whole "room for Flutter" requirement of D-01: the mobile client stores the token it gets from `POST /auth/login` (return `token` in the response body only when the request carries `X-Client: mobile`, or simply never return it and add a dedicated mobile login later; recommendation: **do not return the token in the body in Phase 2**, add the mobile token endpoint when MOB-01 starts, keeping Phase 2 smaller and the web token unreachable by JS).
- **Sliding expiry:** in `authenticate`, `expiresAt = now + 30 d` and re-send the cookie only when `now - lastUsedAt > 1 hour`; skipping the write on every request keeps reads cheap.
- **Revoke:** logout deletes that `Session` row; deactivation, reset and change-password `deleteMany` as per D-06/D-19 (change-password: `where: { userId, NOT: { id: currentSessionId } }`).
- **Housekeeping:** `deleteMany({ where: { expiresAt: { lt: now } } })` for the user at login time is enough for 5-50 users; no cron needed.
- **`req.auth` typing:** module-augment Express `Request` with an optional `auth` (`{ user, sessionId }`) in `middleware/authenticate.ts`.

### Pattern 4: First-run setup and invariants under concurrency (AUTH-04, D-07, D-18)

Two simultaneous `POST /auth/setup` calls (or two admins demoting each other) can both pass a "count" check. Serialise with a transaction-scoped advisory lock:

```ts
// Source: design; PostgreSQL advisory locks via Prisma interactive transaction ($executeRaw) [ASSUMED to work through the pg adapter: prove it with a concurrency test]
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SETUP_LOCK_KEY})`;
  if ((await tx.user.count()) > 0) throw new AppError("SETUP_CLOSED", 409, "Setup is already complete");
  return tx.user.create({ data: { name, email, passwordHash, role: "ADMIN" } });
});
```

Use a second constant key for the **last-admin guard**: lock, then count admins that can actually sign in, i.e. `role = ADMIN AND isActive = true AND passwordHash IS NOT NULL`, excluding the target; refuse with `LAST_ADMIN` (409) if zero would remain. An *invited* admin who has not set a password must not count as "an active admin", otherwise the only real admin could demote themselves into a lock-out. Also refuse "Admin deactivates self" (D-18) with `FORBIDDEN`-class error `VALIDATION_FAILED`/`LAST_ADMIN` as the planner prefers (suggest a dedicated message under `LAST_ADMIN` only for the last-admin case and `FORBIDDEN` for self-deactivation).

`GET /auth/setup-status` returns `{ setupRequired: boolean }` (public; reveals only that no user exists yet) and the login page redirects to `/setup` when true; `/setup` redirects to `/login` when false. The setup route must also create a session (auto sign-in) so the new Admin lands on Home.

### Pattern 5: Hardening middleware in `createApp()` (SEC-05)

Current order is read from `backend/src/app.ts:18-22`:
```ts
  app.use(httpLogger);
  app.use(helmet());
  app.use(cors({ origin: origins, exposedHeaders: ["X-Request-Id"] }));
  app.use(express.json());
```
Target order: `httpLogger -> helmet -> cors({ origin: origins, credentials: true, exposedHeaders: ["X-Request-Id"], maxAge: 600 }) -> originCheck -> cookieParser -> express.json({ limit: "100kb" }) -> /api/v1 (with a no-store header)`.

- **`originCheck`** (CSRF): for methods other than GET/HEAD/OPTIONS, `Origin` present and not in the allow-list -> `FORBIDDEN` 403; `Origin` absent **and a session cookie present** -> `FORBIDDEN` (browsers always send `Origin` on cross-site unsafe requests; a Bearer client sends no cookie, so it is unaffected). CORS alone does not stop the request from executing, it only hides the response, which is why this middleware is needed (Pitfall 3). Combined with `SameSite=Lax` and JSON-only bodies (a non-simple `Content-Type` forces a preflight that the allow-list refuses).
- **Rate limits** as a factory so tests can lift the ceilings (Pitfall 8). Suggested defaults (discretion, A5): per-IP bucket on login, setup, forgot-password, reset-password, accept-invite: **30 requests / 5 min**, `skipSuccessfulRequests: true` on login; per-email bucket on login and forgot-password: **8 requests / 5 min**, keyed on the trimmed lowercase body email (fall back to the IP key when absent). Both answer through `AppError("RATE_LIMITED", 429, ..., { retryAfterSeconds })` via a `handler` that calls `next(err)` so the envelope is identical, with `standardHeaders: "draft-7"` for `Retry-After`. Any custom key generator that falls back to the IP **must** return `ipKeyGenerator(req.ip)`, not `req.ip`, or the library raises `ERR_ERL_KEY_GEN_IPV6` [CITED: express-rate-limit dist/index.d.ts line 9 and 20].
- **`trust proxy`:** add `TRUST_PROXY` (number of proxy hops, default `0`) to `env.ts` and call `app.set("trust proxy", n)` only when > 0; otherwise `req.ip` is the proxy's address in production and every user shares one bucket.
- **Payload size:** `express.json({ limit: "100kb" })`, and map `entity.too.large` to a new `PAYLOAD_TOO_LARGE` (413) code in `error-handler.ts`; `docs/standards/backend.md` already lists this as a known gap ("a body that is too large ... currently become `INTERNAL_ERROR` (500)").
- **`Cache-Control: no-store`** on every `/api/v1` response except the OpenAPI document (prevents `GET /auth/me` and `GET /users` being served from a browser or proxy cache, and 304 revalidation of authenticated JSON).
- **Validation everywhere:** every body schema uses `.strict()` (unknown keys -> `VALIDATION_FAILED`, which also blocks mass-assignment such as `role` in `PATCH /auth/me`); every `:id` param is parsed with `z.uuid()`; the registry-driven contract test below proves it for all routes.

### Pattern 6: App shell and the list pattern (UI-01..03, D-13, D-16)

- **One nav source:** `nav-items.ts` exports `[{ href, label, icon, roles?, bottomTab: boolean }]`. `AppSidebar` (hidden below `md`) renders all items; `BottomTabBar` (visible below `md`) renders items with `bottomTab` plus a "More" `DropdownMenu` for the rest, theme switch and sign-out. Later phases add one line per module.
- **Breakpoints (discretion):** below `md` (768px) = phone: top bar + bottom tab bar, cards; `md` to `lg` = tablet: sidebar **collapsed to icons** (~56px) so the Users table keeps room; `lg`+ = full sidebar (~224px). Tailwind v4 default breakpoints (`md` 48rem, `lg` 64rem).
- **Reserve space for the bottom bar:** content wrapper gets `pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0`; the bar uses `pb-[env(safe-area-inset-bottom)]`; add `viewport: { viewportFit: "cover" }` in the root layout's `viewport` export. Use `min-h-dvh`, not `100vh`.
- **`ResponsiveList<T>`:** props `{ items, columns: [{ header, cell, hideBelow?: "lg" }], renderCard, rowActions, status, error, emptyState, onRetry }`. It renders `<Table>` in a `hidden md:block` wrapper and a `<ul>` of cards in a `md:hidden` wrapper (display-none removes the hidden variant from the accessibility tree). Loading = `Skeleton` rows, empty = `Empty`, failed = `Alert` with a Retry button and `requestId`. Under `lg` the Users table shows name (with email on a second line), role, status, actions and hides the Manager column; no internal horizontal scroller (D-16 says no sideways scroll at all).
- **`PageState`** and **`FormField`** are the other two shared wrappers, so login, profile and users screens cannot drift (UI-03). `FormField` = shadcn `Field` + `FieldLabel` + `FieldError` over a react-hook-form `Controller`.
- **Forms:** use Dialogs for invite/edit user and `AlertDialog` for deactivate/reactivate/resend confirmations (keeps routes few; `DialogContent` gets `max-h-[90dvh] overflow-y-auto` for phones). Auth screens and Profile are pages.

### Pattern 7: Frontend auth slice, bootstrap and guards

- **`auth` slice** follows the mandated `{ data, status, error }` shape, where `data` is the current `Me` (or `null`). Thunks: `fetchMe`, `login`, `logout`, `setupAdmin`, `updateProfile`, `changePassword`. `fetchMe` rejecting with `UNAUTHENTICATED` means "signed out", not an error banner.
- **`AuthGate`** (in `(app)/layout.tsx`): `idle` or `loading` -> full-page skeleton; `succeeded` -> children; `failed` + `UNAUTHENTICATED` -> `router.replace("/login?next=" + encodeURIComponent(pathname))`; `failed` + other (e.g. `NETWORK_ERROR`) -> an error state with Retry (do **not** redirect on network failure). A mirrored `GuestGate` in `(auth)/layout.tsx` sends signed-in users to `/`.
- **Single place for 401:** `http.ts` exports `setUnauthenticatedHandler(fn)`; `StoreProvider` registers `() => store.dispatch(sessionExpired())`. The interceptor calls it **only when `body.error.code === "UNAUTHENTICATED"`**, never on `INVALID_CREDENTIALS` (also HTTP 401). Add `withCredentials: true` to `axios.create` (current definition at `frontend/src/lib/api/http.ts:54-57` has only `baseURL` and `timeout`).
- **Logout clears everything:** wrap the root reducer so the `logout/fulfilled` and `sessionExpired` actions reset all slices to initial state (users list from the previous account must never be visible to the next).
- **`?next=` redirect safety:** accept only values that start with a single `/` and not `//` or a scheme; otherwise go to `/`.
- **Mutations in forms:** dispatch the thunk and `await ...unwrap()` inside `onSubmit`; on rejection map `VALIDATION_FAILED` `details[{path,message}]` onto react-hook-form fields with `setError(path, ...)` and show non-field codes (`INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `RATE_LIMITED`, `ACCOUNT_DEACTIVATED`, `INVALID_TOKEN`, `EMAIL_IN_USE`, `LAST_ADMIN`) as a form-level `Alert` chosen by a `describeError(error)` switch like `health-status.tsx`. The standard's slice recipe covers *loaded data*; record this "mutation via unwrap" convention in `docs/standards/frontend.md` as part of this phase.

### Pattern 8: Mail (D-10, D-12)

```ts
// Source: nodemailer.com/smtp (host, port, secure, auth, requireTLS, timeouts)
// lib/mailer.ts - env-driven, null when SMTP_HOST is unset
const transport = env.SMTP_HOST
  ? createTransport({
      host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    })
  : null;
export const isMailConfigured = () => transport !== null;
export async function sendMail(msg: { to: string; subject: string; text: string }): Promise<boolean> {
  if (!transport) return false;
  try { await transport.sendMail({ from: env.MAIL_FROM, ...msg }); return true; }
  catch (error) { logger.error({ err: error }, "mail send failed"); return false; }   // never throws into the request
}
```

- `sendMail` returns a boolean and never throws; the invite service puts `{ emailed: true }` or `{ emailed: false, link }` in the response, so SMTP being absent **or failing** both degrade to "show the Admin a copyable link" (D-10). The Admin UI banner reads a `mailEnabled` flag returned in `meta` of `GET /users`.
- **Forgot-password must not leak via timing:** respond immediately and send in the background (`void sendMail(...)`); the same for the not-found branch.
- Links are built from `env.APP_URL` (`${APP_URL}/accept-invite?token=...`, `${APP_URL}/reset-password?token=...`), **never from the `Host` header** (host-header poisoning of reset links).
- Plain-text emails only in this phase (A14): nothing user-supplied is interpreted as markup, and no template engine is needed. The mailer lives in `lib/` so Phase 6 reuses `sendMail`.
- Env additions, all validated in `env.ts` (`SMTP_HOST` optional; when set, `MAIL_FROM` required via `superRefine`): `APP_URL` (default `http://localhost:3000`), `TRUST_PROXY` (default 0), `SESSION_COOKIE_SECURE` (default true only when `NODE_ENV === "production"`), `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_SECURE` (default false), `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`. Mirror them in `backend/.env.example` (SMTP left empty with comments) and in `compose.yaml`.
- **Compose** adds a fourth service and points the api at it:

```yaml
  mailpit:
    image: axllent/mailpit:v1.31.4
    ports:
      - "127.0.0.1:${MAIL_UI_PORT:-8025}:8025"   # web inbox (bound to localhost only, like the db)
    healthcheck:
      test: ["CMD", "/mailpit", "readyz"]
      interval: 5s
      timeout: 5s
      retries: 10
  # api service additions
  #   environment: SMTP_HOST: mailpit, SMTP_PORT: "1025", MAIL_FROM: "OpenCRM <no-reply@opencrm.local>",
  #                APP_URL: http://localhost:${WEB_PORT:-3000}
  #   depends_on: mailpit: { condition: service_healthy }
```

### Pattern 9: Teams / manager rules (ROLE-03, D-17, D-19), documented defaults (A3, A4)

- `managerId` may be set only when the user's role is `SALES_REP`, and must reference an **active** `SALES_MANAGER`; otherwise `VALIDATION_FAILED` with `details[{ path: "managerId", ... }]`. (CONTEXT says each user has one optional Manager; restricting to reps matches ROLE-03 and keeps Phase 3's team rule trivial. Phase 3 can relax it for Read-only if that scope is decided.)
- Changing a user's role away from `SALES_REP` clears their `managerId` in the same transaction.
- Changing a manager's role away from `SALES_MANAGER` sets their reps' `managerId` to `null` in the same transaction and returns `meta.reassignedReports: n` so the UI can say so.
- **Deactivating a manager keeps the links** (so reactivation "restores access with the same role and manager" exactly, and no team data is lost); the Users screen shows a warning badge "Manager deactivated" on those reps, and the manager picker lists only active managers.
- Self-service profile (`PATCH /auth/me`) accepts `name` only (`.strict()`); email, role, manager are Admin-only (D-20).
- Changing an *invited* user's email cancels their outstanding invite token (the Admin must resend); changing an active user's email keeps sessions.

### Anti-Patterns to Avoid

- **JWT or a JS-readable token:** contradicts D-01 and makes immediate revocation impossible.
- **Next `proxy.ts` as the auth boundary:** the cookie lives on the API origin; the Next docs themselves say to verify auth close to the data and not rely on Proxy alone [CITED: nextjs.org/docs/app/api-reference/file-conventions/proxy "Good to know"]. Use the client `AuthGate` plus API enforcement.
- **Keying the 401 handler on HTTP status:** use the `UNAUTHENTICATED` code (Pattern 7).
- **Caching "who am I" across logout:** reset all slices on logout.
- **Reading `req.headers.host` for email links:** use `APP_URL`.
- **Putting tokens in the query string of API calls:** the API receives invite/reset tokens in a POST body (pino-http logs the URL, never the body); only the *frontend* page URL carries `?token=`.
- **A repository layer or service-in-routes shortcuts:** the lint rules in `backend/eslint.config.mjs` forbid them; keep supporting code in `lib/` and `middleware/`.
- **Importing the shadcn `sidebar`:** brings the Sheet drawer D-13 rejected.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing / PHC encoding | scrypt/PBKDF2 wrapper with custom salt+param format | `@node-rs/argon2` `hash` / `verify` | Parameter encoding, salting, constant-time compare are easy to get subtly wrong; upgrade path via embedded params |
| Rate limiting | Map-with-timestamps limiter | `express-rate-limit` | Window maths, headers, IPv6 subnetting (the library itself had an IPv6 bypass CVE) |
| SMTP | Raw `net` socket / fetch to an API | `nodemailer` | STARTTLS, auth, address parsing, encoding |
| Random tokens | `Math.random`, UUIDv4 as secret | `node:crypto` `randomBytes(32)` | CSPRNG, 256 bits |
| Cookie parsing | Regex on `req.headers.cookie` | `cookie-parser` | Edge cases in quoting/decoding |
| Form state + validation display | Hand-managed `useState` per field | `react-hook-form` + `zodResolver` + shadcn `Field` | 8+ forms in this phase; consistent invalid/aria wiring |
| Theme flash prevention | Custom inline script + localStorage glue | `next-themes` | Handles `prefers-color-scheme`, class strategy, SSR hydration |
| Dialog/dropdown/select a11y | Custom positioned `div`s | shadcn (Radix) components | Focus trapping, keyboard, ARIA |
| Common-password detection | Own heuristics | Static blocklist file + exact lowercase match | Heuristic rules re-introduce the forced-complexity D-05 rejected |
| OpenAPI docs | Hand-written JSON | Existing `registry.registerPath` + Zod | Already enforced by the drift test |
| Admin invariants under concurrency | "count then update" without a lock | Advisory-lock transaction (Pattern 4) | Two simultaneous requests can both pass a naive check |

**Key insight:** auth bugs are almost never in the algorithm choice; they are in ordering (enumeration, lock bypass, fixation), atomicity (single-use tokens, last admin, first-run race) and lifecycle (what gets revoked when). The patterns above fix the order and use database atomicity for those.

## Common Pitfalls

### Pitfall 1: Using HTTP 401 as "session expired"
**What goes wrong:** a wrong password on the login form (401) triggers the global handler and bounces the user around. **Why:** interceptor keyed on status. **Avoid:** key on `error.code === "UNAUTHENTICATED"`; give the login failure its own code `INVALID_CREDENTIALS`. A wrong *current* password on change-password should be `VALIDATION_FAILED` with `path: "currentPassword"`, not a 401. **Detect:** component test that rejects `INVALID_CREDENTIALS` and asserts no navigation.

### Pitfall 2: Cookie not sent cross-origin
**What goes wrong:** login succeeds, `GET /auth/me` returns 401. **Why:** `withCredentials` missing on axios, or CORS lacks `credentials: true`, or the allow-list is a wildcard (`*` is invalid with credentials). **Avoid:** both settings (Pattern 5/7); `localhost:3000` and `localhost:4000` are *same-site* (site ignores port), so `SameSite=Lax` works in the Compose setup. **Constraint to record (A1):** in production the web and API must share a registrable domain (e.g. `app.example.com` and `api.example.com`) or the same host; two unrelated domains need `SameSite=None; Secure` and a revisit of the CSRF defence.

### Pitfall 3: CORS is not CSRF protection
**What goes wrong:** a cross-site form POST (no preflight) still executes `POST /users/...`; CORS only hides the response. **Avoid:** the `originCheck` middleware plus `SameSite=Lax`; test with an `Origin: http://evil.example` request carrying a valid session cookie and expect 403 with no state change.

### Pitfall 4: Lock never clears / re-locks instantly
**What goes wrong:** after the 15 minutes pass, the first wrong guess locks again because `failedLoginCount` is still 10. **Avoid:** treat an expired `lockedUntil` as "fresh count" (Pattern 2 step 3) and never increment while locked. A **password reset must also clear `failedLoginCount` and `lockedUntil`**, otherwise the legitimate owner cannot recover.

### Pitfall 5: Double-use of a reset/invite link
**What goes wrong:** two requests redeem the same token. **Avoid:** claim with one atomic statement, `updateMany({ where: { id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } })`, and proceed only if `count === 1`. Resending an invite or requesting a second reset first invalidates earlier unused tokens of that type for the user (D-11).

### Pitfall 6: Account enumeration side channels
**What goes wrong:** identical messages but different timing (a real user costs 50 ms of Argon2, an unknown email costs 1 ms), or forgot-password slower when it sends mail. **Avoid:** dummy hash verification (Pattern 2), background mail send, same status and body in both branches. The only deliberate difference is `ACCOUNT_LOCKED` (owner-accepted, D-04).

### Pitfall 7: Unbounded password length
**What goes wrong:** a 100 KB "password" is hashed. **Avoid:** Zod `z.string().min(10).max(128)` *before* hashing; do not trim or otherwise alter passwords; blocklist compare is on the lowercased value.

### Pitfall 8: Rate limiter breaks every other test
**What goes wrong:** the test suite logs in hundreds of times from one IP, hits the 30/5 min bucket, and unrelated tests start failing with 429. **Avoid:** build limiters through `createAuthLimiters(options)`; `createApp(options?)` takes optional overrides; ordinary tests pass a very high ceiling, the dedicated rate-limit test passes `limit: 2`. Memory stores are per limiter instance, so build a new app per test file.

### Pitfall 9: Horizontal scroll from long content
**What goes wrong:** a long email or name widens a flex/grid child and the page scrolls sideways. **Avoid:** `min-w-0` on flex children, `truncate` or `wrap-anywhere` (already used in `health-status` and the old layout) on emails, no fixed pixel widths, table inside a `hidden md:block` wrapper with the Manager column hidden under `lg`. Check `document.documentElement.scrollWidth <= clientWidth` at 375, 768 and 1280 in the UAT.

### Pitfall 10: Bottom bar covers content / iOS safe area
**What goes wrong:** the last list item hides under the tab bar; the iPhone home indicator overlaps it. **Avoid:** bottom padding on the content wrapper plus `env(safe-area-inset-bottom)` and `viewport-fit=cover` (Pattern 6); `fixed inset-x-0 bottom-0` bar; use `dvh` units. Note dialogs/dropdowns portal above the bar (z-index ordering).

### Pitfall 11: Root layout still wraps everything in `max-w-xl`
**What goes wrong:** the current `layout.tsx` puts `<main className="mx-auto w-full max-w-xl wrap-anywhere">` and `p-4 sm:p-8` on `<body>` around all pages, which would squeeze the shell. **Avoid:** strip those wrappers from the root layout and move them into the `(auth)` layout (centered card) and `(app)` shell; keep `wrap-anywhere` on content containers. Both `app/page.tsx` and `app/(app)/page.tsx` cannot exist: move the Phase 1 status page to `app/status/page.tsx` and update the README sentence that says the home page shows API status.

### Pitfall 12: Rate-limit key and proxy mistakes
**What goes wrong:** behind a reverse proxy every request has the proxy's IP (one shared bucket), or `X-Forwarded-For` is trusted blindly and spoofed. **Avoid:** `TRUST_PROXY` hop count (Pattern 5); custom keys use `ipKeyGenerator(req.ip)`; the email key is lowercased and length-capped so an attacker cannot create unlimited buckets with junk strings (Zod-validate email before the limiter or cap at 254 chars).

### Pitfall 13: `useSearchParams` and static prerender
**What goes wrong:** `next build` fails with a missing-Suspense error on `reset-password` and `accept-invite` pages reading `?token=`. **Avoid:** wrap the client component in `<Suspense>` or read the token in an effect from `window.location`. Strip the token from the address bar after reading (`history.replaceState`) and set `Referrer-Policy: no-referrer` via `headers()` in `next.config.ts` so the token does not leak in `Referer`. [ASSUMED, verify in the first build, A10]

### Pitfall 14: next-themes console warning
**What goes wrong:** React 19.x logs "Encountered a script tag while rendering React component" with next-themes 0.4.6 on newer Next versions. Behaviour is unaffected (reported as a harmless warning). **Avoid/accept:** use `suppressHydrationWarning` on `<html>`, keep the provider in a client component, and treat the warning as known; if the zero-warning rule is ever extended to the browser console, fall back to the `next/script` pattern. [CITED: github.com/pacocoursey/next-themes/issues/385, #387; ASSUMED harmless, A11]

### Pitfall 15: Generated artefacts forgotten
**What goes wrong:** CI fails on the OpenAPI drift test or `git diff --exit-code -- src/lib/api/schema.d.ts`. **Avoid:** after any route/schema/error-code change run `pnpm --dir backend openapi:generate` then `pnpm --dir frontend api:types` and commit both; update the two tests that pin the error-code list (`error-handler.test.ts` "lists exactly the four Phase 1 codes" and the `ErrorCode` test in `openapi.test.ts`, per `docs/standards/backend.md`), the error-code table in `backend.md`, and the "no models yet" sentences in `backend.md`, `structure.md` and the schema header comment.

### Pitfall 16: Express 5 specifics
`req.query` is read-only (parse, never assign); an async handler needs no `try/catch`; `req.body` is `undefined` when the content type is not JSON, so a missing body surfaces as a Zod `VALIDATION_FAILED` (desired). `res.cookie` and `res.clearCookie` must be called with identical `path`/`sameSite`/`secure` options or the browser keeps the cookie.

### Pitfall 17: Dependabot / audit
Adding `nodemailer < 10.0.13` fails the high-severity audit gate. Pin >= 10.0.13 and let Dependabot's grouped weekly PR move it.

## Code Examples

### Strict body schemas and password policy (Zod 4, imported from `lib/openapi`)

```ts
// Source: pattern per docs/standards/backend.md (import z from lib/openapi) + Zod 4 API already used in repo
import { z } from "../../lib/openapi";

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const passwordSchema = z.string().min(10, "Use at least 10 characters").max(128);
// the blocklist check is async/in-service: isCommonPassword(pw) -> VALIDATION_FAILED details[{ path: "password", message: "That password is too common" }]

export const loginBodySchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict().openapi("LoginBody");
export const meUpdateSchema = z.object({ name: z.string().trim().min(1).max(100) }).strict().openapi("UpdateProfileBody");
export const idParamSchema = z.object({ id: z.uuid() });
```

### Controller (thin, Zod in controller)

```ts
// Source: copy of backend/src/modules/health/health.controller.ts shape
export async function loginHandler(req: Request, res: Response) {
  const input = loginBodySchema.parse(req.body);
  const { token, user } = await login(input.email, input.password);
  setSessionCookie(res, token);
  res.json({ data: toMe(user), meta: {} });
}
```

### `requireRole`

```ts
export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.auth) throw new AppError("UNAUTHENTICATED", 401, "Sign in required");
  if (!roles.includes(req.auth.user.role)) throw new AppError("FORBIDDEN", 403, "You do not have access to this");
  next();
};
// users.routes.ts: usersRouter.use(authenticate, requireRole("ADMIN"));
```

### Registry-driven "every endpoint validates" contract test (SEC-05 criterion 4)

```ts
// Source: design; registry.definitions is what openapi.ts already passes to OpenApiGeneratorV31
for (const def of registry.definitions) {
  if (def.type !== "route") continue;
  // public routes: send "{}" / malformed ids -> expect 400 VALIDATION_FAILED
  // protected routes: unauthenticated -> 401 UNAUTHENTICATED; admin agent + invalid body/param -> 400 VALIDATION_FAILED
}
```
(An allow-list of routes with no input, e.g. `GET /auth/me`, `POST /auth/logout`, `GET /auth/setup-status`, documents the exceptions explicitly.)

### Frontend 401 handler registration

```ts
// frontend/src/lib/api/http.ts (additions)
let onUnauthenticated: (() => void) | null = null;
export const setUnauthenticatedHandler = (fn: (() => void) | null) => { onUnauthenticated = fn; };
// inside the response interceptor error branch, after toApiError(...):
//   if (apiError.code === "UNAUTHENTICATED") onUnauthenticated?.();
export const http = axios.create({ baseURL: env.NEXT_PUBLIC_API_URL, timeout: 10000, withCredentials: true });
```

### Theme provider and root layout skeleton

```tsx
// Source: ui.shadcn.com/docs/dark-mode/next (attribute="class", defaultTheme="system", enableSystem, disableTransitionOnChange)
<html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
  <body>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <StoreProvider>{children}</StoreProvider>
      <Toaster />
    </ThemeProvider>
  </body>
</html>
```
`globals.css` already has `@custom-variant dark (&:is(.dark *));` and a `.dark` token block, so the class strategy works without CSS changes.

### react-hook-form + shadcn Field (documented pattern)

```tsx
// Source: ui.shadcn.com/docs/forms/react-hook-form
<Controller name="email" control={form.control} render={({ field, fieldState }) => (
  <Field data-invalid={fieldState.invalid}>
    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
    <Input {...field} id={field.name} type="email" autoComplete="username" aria-invalid={fieldState.invalid} />
    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
  </Field>
)} />
```
Use `autoComplete="current-password"` / `"new-password"` on password fields so password managers work, and a show/hide toggle in the shared `PasswordInput`.

### Error codes to add (one plan, one regeneration)

Existing list (read this session, `backend/src/lib/app-error.ts:3-8`): `"VALIDATION_FAILED", "NOT_FOUND", "SERVICE_UNAVAILABLE", "INTERNAL_ERROR"`. Proposed additions (adding is safe; renaming is a breaking change):

| Code | HTTP | Use |
|------|------|-----|
| `UNAUTHENTICATED` | 401 | No/expired/revoked session or inactive user (the only code the client treats as "signed out") |
| `INVALID_CREDENTIALS` | 401 | Login failure, one message for wrong email and wrong password |
| `FORBIDDEN` | 403 | Wrong role, bad `Origin`, self-deactivation |
| `ACCOUNT_DEACTIVATED` | 403 | Correct password, account deactivated |
| `ACCOUNT_LOCKED` | 423 | Temporary lock; `details.retryAfterSeconds` |
| `RATE_LIMITED` | 429 | Limiter; `details.retryAfterSeconds` |
| `INVALID_TOKEN` | 400 | Invite/reset link invalid, expired or already used |
| `SETUP_CLOSED` | 409 | First-run route after a user exists |
| `EMAIL_IN_USE` | 409 | Duplicate email (catch Prisma unique violation `P2002` as well as pre-check, for races) |
| `LAST_ADMIN` | 409 | Would leave no active admin |
| `PAYLOAD_TOO_LARGE` | 413 | Body over the JSON limit |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Next.js `middleware.ts` | `proxy.ts` (Node runtime default); middleware deprecated | Next 16.0.0 | Do not use either as the auth boundary here; client `AuthGate` + API enforcement [CITED: nextjs.org proxy docs] |
| shadcn `form` (react-hook-form `FormField`) | shadcn `field` + RHF `Controller` | recent shadcn | Use `Field`; `form` still exists in the registry but docs steer to `Field` [CITED: ui.shadcn.com/docs/forms/react-hook-form] |
| bcrypt as default | Argon2id (OWASP first choice, m=19456 t=2 p=1 minimum) | OWASP cheat sheet | `@node-rs/argon2` defaults already match [CITED: OWASP Password Storage Cheat Sheet via search; github.com/napi-rs/node-rs] |
| Forced complexity rules | Length + blocklist (NIST 800-63B) | NIST 800-63B Rev. 4 (2025) | Matches D-05. Note NIST Rev. 4 sets the minimum at 15 characters when a password is the only authenticator, against the owner's locked 10; informational only, D-05 stands (A16) [CITED: sakimura.org/en/2025/10/7710, enzoic.com summary] |
| Node `crypto` without Argon2 | `crypto.argon2` stable-ish in Node >= 24.7.0 | v24.7.0 | A zero-dependency option later if `engines` is raised to `>=24.7` |
| nodemailer 6-9 JS | nodemailer 10 (TypeScript rewrite, bundled types, dual ESM/CJS, Node >= 20) | 2026-09-03 | No `@types/nodemailer`; patch quickly (many advisories fixed by 10.0.13) |

**Deprecated/outdated:** shadcn `toast` (replaced by `sonner` in this registry style); Next `middleware.ts`; `express-rate-limit` < 8.3.0 IPv6 default key generator.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A0 | Package choices `@node-rs/argon2`, `nodemailer`, `express-rate-limit`, `cookie-parser` are right for this repo (selected from knowledge; confirmed only for existence, metadata and advisories) | Standard Stack | Owner may prefer `argon2` or another mailer; low cost to swap before install |
| A1 | Production deploys the web app and API on the same site (same host or one registrable domain), so `SameSite=Lax` cookies work | Pitfall 2, Pattern 3 | Cross-site deploys break login silently; would need `SameSite=None` and a token CSRF defence |
| A2 | Strict Origin verification + `SameSite=Lax` + JSON-only is an acceptable CSRF defence without a token (OWASP labels Origin checks "defence in depth") | Pattern 5 | Owner or auditor may want a synchronizer token; adds a header and a `GET /auth/csrf` endpoint |
| A3 | `managerId` allowed only for `SALES_REP`, must point at an active `SALES_MANAGER`; role change away from rep clears it | Pattern 9 | Phase 3 may want Read-only users in teams; relax the rule then |
| A4 | Deactivating a manager keeps the reps' `managerId`; changing a manager's role clears their reps' links | Pattern 9 | Owner may prefer auto-unassign on deactivation |
| A5 | Rate-limit numbers: 30 req/5 min per IP bucket, 8 req/5 min per email bucket (login, forgot), lock 10 wrong / 15 min | Pattern 5 | Too tight annoys users behind shared NAT; too loose weakens brute-force protection |
| A6 | In-memory rate-limit store is acceptable (single API process; counters reset on restart; account lock is in the DB) | Alternatives | Multi-instance deployments need a shared store |
| A7 | Blocklist = SecLists NCSC top-100k filtered to >= 10 chars (9,307 entries, lowercase exact match) is enough for D-05 | Standard Stack | Weaker than a breached-password API; larger lists possible later |
| A8 | Phase 1 status page moves to `/status` (kept, public) rather than being deleted or shown on Home | Structure | Owner may want it removed or admin-only |
| A9 | `pg_advisory_xact_lock` inside a Prisma interactive transaction works through `@prisma/adapter-pg` | Pattern 4 | Fall back to `Serializable` isolation with retry; prove with a concurrency test |
| A10 | `useSearchParams` needs a Suspense boundary on token pages in Next 16.4 | Pitfall 13 | A build error found early; trivial fix |
| A11 | The next-themes 0.4.6 script-tag warning on React 19 / Next 16 is cosmetic | Pitfall 14 | If it breaks theming, use a hand-written inline script |
| A12 | `GET /users` returns all users (<= 200) in one response, no paging contract yet | API | Phase 3 lists need paging; defining `meta` paging now would be extra scope |
| A13 | Token is not returned in the login body in Phase 2; mobile token endpoint arrives with MOB-01 | Pattern 3 | If the mobile client is brought forward, add the endpoint then |
| A14 | Plain-text emails only | Pattern 8 | Owner may want branded HTML; add a template step later |
| A15 | Playwright/e2e is out of scope for Phase 2; responsive "no horizontal scroll" is verified in manual UAT (and optionally with the agent-browser skill) | Validation | If the owner wants automated layout checks, a Playwright dependency + CI browser install is a separate approval |
| A16 | D-05 (10 characters) stays even though NIST 800-63B-4 asks for 15 when password-only | State of the Art | Informational; the owner decided |
| A17 | Prisma error `P2002` is how a unique-email violation surfaces through the pg adapter in Prisma 7 | EMAIL_IN_USE | Pre-check still works; test the race |

## Open Questions

1. **Does the owner approve the exact dependency list and pins?**
   - What we know: eight new npm packages plus one Docker image; security.md requires owner approval per dependency and a name check on npmjs.com; four are flagged SUS only for release freshness.
   - Recommendation: one `checkpoint:human-verify` task up front listing names and pins, before any `pnpm add`.
2. **Production topology: are web and API on one site?** (A1)
   - Recommendation: document the same-site requirement in the README/`.env.example` comments; ask the owner before deploying across domains.
3. **Is an Origin-check CSRF defence acceptable, or does the owner want a token?** (A2)
   - Recommendation: ship Origin + SameSite; revisit with the Flutter work.
4. **Should deactivated managers' reps be auto-unassigned?** (A4) Recommendation: keep links and warn; confirm in the plan.
5. **What happens to the status page?** (A8) Recommendation: keep at `/status`, public, no nav entry.
6. **Users list paging:** unpaginated for now (A12); settle the paging `meta` contract in Phase 3 together with the first big list, and then retrofit the Users list if desired.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + Compose | Whole dev stack, Prisma migrations, backend tests' PostgreSQL | yes | Docker 29.4.0, daemon answering `docker ps` | none needed |
| PostgreSQL 18 (Compose `db`) | Sessions/users, `opencrm_test` | via Compose (not running now; unrelated postgres 15/16 containers on 5433/5434 do not conflict with 5432) | `postgres:18-alpine` | none |
| Node (host) | Running tests/lint outside Docker | host has **v25.6.0**; repo requires `>=24 <25` | v25.6.0 | Run checks inside the `api`/`web` containers (Node 24), as Phase 1 did; host runs may hit engine warnings |
| pnpm | Installs | yes | 11.28.5 (matches `packageManager`) | - |
| Mailpit image | Dev mail inbox | to be pulled | `axllent/mailpit:v1.31.4` (Docker Hub tag exists, 2026-10-03) | Without it the app still works: invite shows a copyable link (D-10) |
| Real SMTP server | Production email | not needed in this phase | - | Env-configured; absent = link shown to Admin |
| Network access | `npm view`, shadcn registry, Google font at `next build` | yes (used this session) | - | - |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** host Node 24 (use containers).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3 in both apps; supertest 7.3.1 + real `opencrm_test` PostgreSQL (backend); Testing Library 16.3.3 + jest-dom 7.0.1 + jsdom 30.1.2 (frontend) [VERIFIED: backend/package.json, frontend/package.json] |
| Config file | `backend/vitest.config.ts`, `frontend/vitest.config.ts`, `frontend/vitest.setup.ts` (exist) |
| Quick run command | `pnpm --dir backend exec vitest run src/modules/auth` / `pnpm --dir frontend exec vitest run src/features/auth` |
| Full suite command | `pnpm --dir backend check && pnpm --dir backend test && pnpm --dir frontend check && pnpm --dir frontend test && pnpm --dir frontend build` (plus `openapi:generate` + `api:types` and `git diff --exit-code` on both generated files, as CI does) |

Backend tests need PostgreSQL: `docker compose up -d --wait db` first (`docs/standards/testing.md`).

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-04 | First visitor creates Admin; second attempt `SETUP_CLOSED`; `setup-status` flips; concurrent setups create one user | integration | `pnpm --dir backend exec vitest run src/modules/auth/auth.test.ts -t setup` | Wave 0 |
| AUTH-01 | Login ok; wrong email and wrong password identical body; deactivated shows distinct code only after right password; lock after 10, clears after 15 min (fake timers/DB timestamp), no increment while locked | integration | `... auth.test.ts -t login` | Wave 0 |
| AUTH-02 | Cookie attributes (`HttpOnly`, `SameSite=Lax`, `Path=/`); `/auth/me` works with cookie and with Bearer; logout then `/auth/me` is 401; expired session is 401; sliding expiry extends | integration | `... auth.test.ts -t session` | Wave 0 |
| AUTH-03 | Forgot always 200 generic; mail captured with link; token single-use; expiry 1 h; reset clears lock and all sessions; deactivated user gets no mail/can't reset | integration (mailer spied) | `... auth.test.ts -t reset` | Wave 0 |
| AUTH-05 | `PATCH /auth/me` name only (`role` key rejected); change-password keeps current session, deletes others; wrong current password -> `VALIDATION_FAILED` path `currentPassword` | integration | `... auth.test.ts -t profile` | Wave 0 |
| D-05 | Length 10, max 128, blocklist rejects (e.g. a >=10-char common entry), accepted otherwise, same rule on all four entry points | unit + integration | `pnpm --dir backend exec vitest run src/lib/password.test.ts` | Wave 0 |
| ROLE-01 | Admin invite (mail on: no link in body; mail off: link in body), edit, deactivate (sessions gone, login blocked), reactivate; resend cancels old link; duplicate email `EMAIL_IN_USE` | integration | `pnpm --dir backend exec vitest run src/modules/users/users.test.ts` | Wave 0 |
| ROLE-02 | Exactly one of four roles; invalid role `VALIDATION_FAILED`; last admin cannot be demoted/deactivated (`LAST_ADMIN`); admin cannot deactivate self | integration | `... users.test.ts -t role` | Wave 0 |
| ROLE-03 | Manager rules (Pattern 9): rep-only, active manager only, clearing on role change | integration | `... users.test.ts -t manager` | Wave 0 |
| ROLE-01..03 access | Non-admin (manager, rep, read-only) and anonymous get 403/401 on every `/users` route | integration | `... users.test.ts -t access` | Wave 0 |
| SEC-05 | helmet headers present; CORS credentials + allow-list; disallowed Origin with cookie -> 403 and no state change; rate limit returns 429 `RATE_LIMITED` with `Retry-After`; oversized body -> 413 `PAYLOAD_TOO_LARGE`; `Cache-Control: no-store` | integration | `pnpm --dir backend exec vitest run src/middleware` | Wave 0 |
| SEC-05 (validation everywhere) | Every route in `registry.definitions` returns 400 `VALIDATION_FAILED` for bad input (or is on the explicit no-input allow-list) and 401 when unauthenticated (protected) | integration (contract) | `pnpm --dir backend exec vitest run src/middleware/endpoint-contract.test.ts` | Wave 0 |
| OpenAPI | New paths and error codes in `openapi.json`; drift test passes | drift | `pnpm --dir backend test` | exists (`openapi.test.ts`), update |
| UI-02/03 | Shared components: `ResponsiveList` renders both table and card markup, loading/empty/error states, retry; `FormField` shows server field error; `PageState` | component | `pnpm --dir frontend exec vitest run src/components` | Wave 0 |
| AUTH-01/02 (web) | Login form: success navigates; `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `RATE_LIMITED`, `ACCOUNT_DEACTIVATED` messages; redirect to `/setup` when `setupRequired`; `?next=` rejects `//evil` | component | `pnpm --dir frontend exec vitest run src/features/auth` | Wave 0 |
| AUTH-02 (web) | `AuthGate`: loading skeleton, redirect on `UNAUTHENTICATED`, retry on `NETWORK_ERROR`; interceptor fires handler only for code `UNAUTHENTICATED`; logout resets slices | slice + component | `... src/features/auth src/lib/api` | Wave 0 |
| ROLE-01..03 (web) | Users screen: Admin sees actions; non-admin sees no access; invite dialog shows copyable link when `emailed:false`; deactivate confirm | component | `pnpm --dir frontend exec vitest run src/features/users` | Wave 0 |
| UI-01 | No horizontal page scroll at 375 / 768 / 1280; bottom bar does not cover content; dark mode readable | **manual UAT** | (see below) | n/a |
| D-12 | Invite/reset emails appear in Mailpit at `http://localhost:8025` | **manual UAT** | `docker compose up` then invite a user | n/a |

Manual-only justification: jsdom does not apply Tailwind/CSS, so layout, safe-area and visual dark-mode behaviour cannot be asserted there, and the stack has no browser test runner (adding Playwright is a separate dependency decision, A15). The UAT checklist should list the three widths, the bottom tab bar + "More", light/dark/system switching, and reading the invite email in Mailpit.

### Sampling Rate
- **Per task commit:** the app's `check` plus the single test file(s) touched (`pnpm --dir <app> exec vitest run <path>`), under ~30 s.
- **Per wave merge:** `pnpm --dir backend check && test`, `pnpm --dir frontend check && test`, plus regenerate OpenAPI/types and `git diff --exit-code` on both generated files.
- **Phase gate:** full suite green, both builds green, `pnpm audit --audit-level=high` clean in both apps, then `/gsd-verify-work` with the manual UAT items.

### Wave 0 Gaps
- [ ] `backend/test/helpers.ts` - `resetDatabase()` (delete in FK order: sessions, tokens, users), `createUser({ role, password, isActive })`, `loginAs(app, user)` returning a supertest agent with the cookie and `Origin` header preset, `captureMail()` spy on `lib/mailer.sendMail`
- [ ] `backend/src/lib/password.test.ts`, `backend/src/lib/mailer.test.ts`
- [ ] `backend/src/modules/auth/auth.test.ts`, `backend/src/modules/users/users.test.ts`
- [ ] `backend/src/middleware/security.test.ts` (headers, CORS, Origin check, rate limit, payload) and `endpoint-contract.test.ts`
- [ ] Update `error-handler.test.ts` and `openapi.test.ts` for the new error-code list; supertest requests must set `Origin: http://localhost:3000` for cookie-authenticated unsafe calls
- [ ] `frontend/src/test/render-with-store.tsx` helper (fresh `makeStore()` + `Provider`, mocked `next/navigation` router) and the feature/component tests above
- [ ] No framework install needed (Vitest/Testing Library already present)

## Security Domain

`security_enforcement` is enabled with `security_asvs_level: 1` and `security_block_on: high` (`.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Argon2id (`@node-rs/argon2`), length-only policy + blocklist (D-05), generic failure messages, lockout + rate limit, single-use hashed reset/invite tokens |
| V3 Session Management | yes | 256-bit CSPRNG token, hashed at rest, httpOnly + SameSite=Lax + Secure(prod) cookie, new session per login, server-side revocation on logout/deactivation/reset/change |
| V4 Access Control | yes | `authenticate` + `requireRole(ADMIN)` on every `/users` route; client hiding is cosmetic; last-admin invariant in a locked transaction |
| V5 Input Validation | yes | Zod `.strict()` on every body, `z.uuid()` on params, length caps, central `VALIDATION_FAILED`; registry-driven contract test |
| V6 Cryptography | yes | `node:crypto` `randomBytes`/SHA-256 for tokens; Argon2id for passwords; never hand-rolled |
| V7 Error handling / logging | yes | Envelope hides internals (existing); `cookie`/`set-cookie`/`authorization` already redacted in pino; never log passwords/tokens/links; log mail failures without recipients' tokens |
| V8 Data protection | yes | `Cache-Control: no-store` on API; `Referrer-Policy: no-referrer` on token pages; tokens stripped from the address bar |
| V13 API | yes | Versioned `/api/v1`, content-type JSON-only, body size cap, CORS allow-list, Origin check |
| V14 Configuration | yes | helmet defaults (exists), env-validated secrets, no secret in frontend env, exact dependency pins + audit gate |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Credential stuffing / brute force | Spoofing | Per-IP and per-email limiters + 10-strike 15-minute lock (D-04) |
| Account enumeration (message, timing, forgot-password) | Information disclosure | Identical bodies, dummy hash on unknown email, background mail send (only the lock message differs, accepted) |
| Lock-out griefing | Denial of service | Accepted by owner (D-04); per-IP limiter slows an attacker; reset clears the lock |
| CSRF on cookie sessions | Tampering | Origin allow-list check on unsafe methods + SameSite=Lax + JSON-only + CORS allow-list |
| Session theft via XSS | Spoofing | httpOnly cookie (token never visible to JS); React text nodes only; no `dangerouslySetInnerHTML` (frontend standard) |
| Session fixation | Spoofing | New random token on every login/setup/accept-invite |
| Reset/invite token leakage (logs, Referer, history) | Information disclosure | Token only in POST body to the API, hashed in DB, `Referrer-Policy: no-referrer`, `replaceState`, short TTLs, single-use atomic claim |
| Host-header poisoning of emailed links | Spoofing | Links built from `APP_URL`, never `Host` |
| Mass assignment / privilege escalation (`role` in profile update) | Elevation of privilege | `.strict()` schemas; profile accepts `name` only; role/manager only on `/users` behind `requireRole` |
| Lock-out of the whole install (last admin) | Denial of service | `LAST_ADMIN` guard counting only active admins with a password, under advisory lock |
| First-run takeover race | Elevation of privilege | Setup in an advisory-lock transaction; route closed permanently after the first user (D-07) |
| Spoofed `X-Forwarded-For` bypassing limits | Spoofing | `trust proxy` only via explicit `TRUST_PROXY` hops; `ipKeyGenerator` for IPv6 |
| Open redirect via `?next=` | Spoofing | Accept only same-origin paths starting with a single `/` |
| Email header injection via name/email | Tampering | Zod trims and bounds fields; reject control characters in `name`; nodemailer address parsing; patched nodemailer >= 10.0.13 |
| Vulnerable dependency (nodemailer, rate limiter) | Various | Pin patched versions; `pnpm audit` gate; Dependabot (existing) |
| Oversized body DoS | Denial of service | `express.json({ limit: "100kb" })`, 413 mapping, password max 128 |

## Sources

### Primary (HIGH confidence)
- Repository files read this session: `D:/Milan/opencrm/backend/src/app.ts` (lines 14-25), `backend/src/lib/app-error.ts` (lines 1-10), `backend/src/env.ts` (lines 1-10), `backend/prisma/schema.prisma`, `frontend/src/lib/api/http.ts` (lines 52-62), plus `backend/package.json`, `frontend/package.json`, `compose.yaml`, `backend/vitest.config.ts`, `backend/test/global-setup.ts`, `docs/standards/{backend,frontend,security,testing,structure}.md`, `.github/workflows/ci.yml`, `.planning/{REQUIREMENTS,STATE}.md`, `02-CONTEXT.md`.
- npm registry (`npm view`) and `gsd-tools query package-legitimacy check` for all new packages; GitHub advisories API (`api.github.com/repos/nodemailer/nodemailer/security-advisories`, `api.github.com/advisories?affects=...`).
- Node.js v24 docs `nodejs.org/docs/latest-v24.x/api/crypto.html`: `crypto.argon2` "Added in: v24.7.0".
- shadcn radix-nova registry JSON (`ui.shadcn.com/r/styles/radix-nova/*.json`): item list and dependency lists for field, empty, spinner, sonner, table, dropdown-menu, alert-dialog, sidebar.
- Docker Hub tag API and GitHub releases API for `axllent/mailpit` (v1.31.4, 2026-10-03).
- Next.js 16.4 docs, Proxy file convention (`nextjs.org/docs/app/api-reference/file-conventions/proxy`).
- express-rate-limit 8.7.1 type definitions via unpkg (`ipKeyGenerator`, `standardHeaders`, `skipSuccessfulRequests`).
- `@node-rs/argon2` README and `index.d.ts` (API, defaults, PHC output; `Algorithm` is a `declare const enum`, so rely on defaults instead of importing it).

### Secondary (MEDIUM confidence)
- ui.shadcn.com docs: forms/react-hook-form, dark-mode/next, components/field, components/empty.
- nodemailer.com/smtp and nodemailer CHANGELOG (v9, v10 notes).
- OWASP Cheat Sheet Series: CSRF Prevention (Origin verification and SameSite as defence in depth), Session Management, Password Storage (Argon2id parameters) as summarised by the fetch/search tools.
- SecLists repository (MIT) `Passwords/Common-Credentials/100k-most-used-passwords-NCSC.txt`, downloaded and filtered locally (9,307 entries >= 10 chars).
- NIST SP 800-63B Rev. 4 summaries (sakimura.org, enzoic.com).
- Mailpit healthcheck `/mailpit readyz` via the Dokploy template.

### Tertiary (LOW confidence)
- next-themes issues #385/#387 (script-tag warning on Next 16); `useSearchParams` Suspense requirement; Prisma advisory-lock-through-adapter behaviour; Prisma `P2002` through the pg adapter (A9, A10, A11, A17 - validate in the first plan's tests).

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM-HIGH - versions and advisories verified live; three libraries are very recent releases (pinned conservatively); selection of four backend packages rests partly on training knowledge (A0).
- Architecture: HIGH - built directly on the Phase 1 code actually read; session/token/CSRF design follows OWASP guidance; a few Prisma/pg-adapter behaviours (A9, A17) need an early proof test.
- Pitfalls: HIGH for auth ordering/atomicity/CORS/401 handling; MEDIUM for Next 16 + next-themes + Suspense items.
- Validation approach: HIGH - reuses the existing Vitest/supertest/real-DB setup; responsive checks are explicitly manual.

**Research date:** 2026-10-08
**Valid until:** 2026-10-22 for the library pins (nodemailer and the rate limiter are releasing patch versions every few days; re-run `npm view <pkg> time` at install), 30 days for the architecture and security guidance.
