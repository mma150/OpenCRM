# Phase 2: Authentication, Users & App Shell - Context

**Gathered:** 2026-10-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 delivers secure access to OpenCRM and the frame every later screen lives in: first-run creation of the initial Admin, email-and-password login with a persistent session and logout, password reset by emailed link, a profile page where a user edits their own name and password, Admin user management (invite, edit, deactivate, reactivate, one of four roles, assignment of reps to a manager), baseline API hardening (security headers, CORS allow-list, rate limiting on auth routes, validation on every endpoint), and the first shared component set, design tokens and responsive app shell.

Not in this phase: record-level visibility per role (ROLE-04..08, Phase 3), any CRM record screens, the real dashboard (Phase 6), in-app SMTP settings (MAIL-01, Phase 8), social login and two-factor authentication (v2). Phase 2 stores each user's role and manager; Phase 3 is the first phase that uses them to filter records.

</domain>

<decisions>
## Implementation Decisions

### Sessions & login rules
- **D-01:** Logins are server-side sessions stored in PostgreSQL, carried by an httpOnly cookie in the browser. No JWT access/refresh tokens. Logout and deactivation must end a session immediately. The design must leave room for the later Flutter app to use the same sessions with a token header. — **Reversibility:** costly — the web client, the API auth middleware and the later mobile client are all written against this session model; switching to JWT means changing every authenticated request path.
- **D-02:** A session lasts 30 days and is renewed on use (sliding expiry). After 30 days without activity the user signs in again. No "Remember me" checkbox.
- **D-03:** A user may be signed in on any number of devices at once; each device has its own session. No session-list screen in this phase.
- **D-04:** Repeated wrong passwords are handled two ways together: auth routes are rate-limited (per address and per email, refused for a few minutes with a clear message), AND the account itself is locked temporarily after about 10 consecutive wrong passwords, for 15 minutes. The lock clears on its own; no Admin unlock is needed. The owner chose this over the recommended rate-limit-only option and accepts that someone who knows an email can lock that person out for 15 minutes.
- **D-05:** Password rule is length only: at least 10 characters, no forced character classes, and very common passwords are rejected. The same rule applies at setup, invite acceptance, reset and change.
- **D-06:** Changing a password keeps the current device signed in and ends every other session of that user. Resetting a password from an emailed link ends all of that user's sessions; they sign in fresh.
- **D-07:** First run: while no user exists, the app shows a one-time "Create the Admin account" page (name, email, password). Once the first user exists, that page and its API route are closed permanently. No setup token and no env/CLI bootstrap.
- **D-08:** Login and forgot-password never reveal whether an email has an account: wrong email and wrong password give the same "Email or password is incorrect" message, and forgot-password always answers "If that email exists, we sent a link". A deactivated user sees a distinct "account deactivated" message only after entering the correct password.

### Invites & email delivery
- **D-09:** An Admin invites a user by entering name, email and role. The user receives an emailed link and sets their own password; the Admin never knows it. The account shows as "Invited" until the link is used. Admins do not set temporary passwords.
- **D-10:** The app never blocks on missing email. If SMTP is not configured, an invite still succeeds and the Admin is shown a copyable link to pass on by other means; an Admin can likewise generate a reset link for a user. A banner tells Admins that outgoing email is off. When SMTP is configured, the link is emailed and not shown.
- **D-11:** Invite links are valid for 7 days, password-reset links for 1 hour. Both are single-use. An Admin can resend an invite, which cancels the earlier link.
- **D-12:** Outgoing mail in this phase is configured by environment variables (the in-app SMTP settings screen is Phase 8). Local development adds a mail-catcher service (e.g. Mailpit) to the Compose stack so every email appears in a local web inbox and nothing leaves the machine. The mailer must be reusable by Phase 6 reminder emails.

### App shell & navigation
- **D-13:** Navigation is a left sidebar with module links plus a top bar holding the user menu on desktop and tablet; on phones the sidebar is replaced by a bottom tab bar showing the most used sections plus "More". The owner chose this over the recommended slide-in drawer. — **Reversibility:** costly — every later module adds its entry to both the sidebar and the bottom-tab/More navigation, and page layouts reserve space for the bottom bar on phones.
- **D-14:** After signing in, every user lands on a simple Home page: a greeting by name, their role, and shortcuts to what exists (Profile; Users for Admins). Phase 6 replaces its content with the real dashboard, so the route and nav item are created now.
- **D-15:** The app has light and dark themes. Design tokens are defined for both now; the app follows the device setting by default and the user menu offers a Light / Dark / System switch.
- **D-16:** Lists are a table with columns on desktop and tablet, and stacked cards on phones (for Users: name, role, status, actions menu), with no sideways scroll at any width. This is the single list pattern every later module copies. — **Reversibility:** costly — Leads, Contacts, Opportunities and Tasks lists in Phases 3-6 are all built on this pattern.

### Teams & user rules
- **D-17:** A team is not a separate record. Each user has one optional "Manager" field pointing at a user with the Sales Manager role; a manager's team is everyone who reports to them. A rep has at most one manager. — **Reversibility:** costly — Phase 3's "managers see their team's records" rule and every later per-team figure read this one relationship; moving to named or many-to-many teams needs a data migration and a rewrite of those rules.
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project planning
- `.planning/PROJECT.md` — goals, constraints (stack, single org, responsive, commit rule) and key decisions
- `.planning/REQUIREMENTS.md` — AUTH-01..05, ROLE-01..03, SEC-05, UI-01..03 are this phase's requirements; ROLE-04..08 are Phase 3 and AUTH-06/07 are v2
- `.planning/ROADMAP.md` §Phase 2 — goal and the five success criteria
- `.planning/STATE.md` — open concerns: env-configured mailer needed before MAIL-01; Read-only visibility scope is a Phase 3 question
- `.planning/phases/01-repository-foundation-standards/01-CONTEXT.md` — Phase 1 decisions D-01..D-25 that still bind this phase (feature folders, thunks with axios, module layering, envelope, error codes, kebab-case, env validation)
- `.claude/CLAUDE.md` — commit rules for every agent working in this repo

### Written standards (follow unchanged)
- `docs/standards/structure.md` — folder layout for `frontend/` and `backend/`
- `docs/standards/backend.md` — module layering, validation, envelope, error codes, logging
- `docs/standards/frontend.md` — feature folders, the slice and thunk pattern, typed hooks
- `docs/standards/security.md` — security rules new code must meet
- `docs/standards/testing.md` — Vitest, supertest on a real test database, Testing Library
- `docs/standards/commits.md` — commit format

### Architecture decisions
- `docs/decisions/0003-async-thunks-with-axios.md` — no RTK Query; one axios instance
- `docs/decisions/0004-all-in-docker-development.md` — whole stack in Compose; the mail catcher joins it
- `docs/decisions/0001-node-lts-pin.md`, `docs/decisions/0002-root-tooling-package.md` — Node pin and root tooling package

No external specs exist; requirements are fully captured in the decisions above and the documents listed.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/app.ts` — already applies `helmet()`, a CORS allow-list from `CORS_ORIGINS` and the request logger; rate limiting, cookie/session handling and credentialed CORS are added here.
- `backend/src/lib/app-error.ts`, `backend/src/middleware/error-handler.ts`, `backend/src/middleware/not-found.ts` — the error envelope and stable error codes; new codes (unauthenticated, forbidden, rate limited, account locked, last admin) extend this.
- `backend/src/lib/openapi.ts` and `backend/openapi/openapi.json` — OpenAPI generated from Zod schemas; every new route is registered here.
- `backend/src/lib/prisma.ts` and `backend/prisma/schema.prisma` — Prisma client; the schema has no models yet, so User and Session are the first.
- `backend/src/env.ts`, `frontend/src/env.ts` — Zod-validated environment modules; SMTP, session and app-URL variables are added here and to the `.env.example` files.
- `backend/src/modules/health/` — the reference module (routes, controller, service, schema, test) to copy for `auth` and `users`.
- `frontend/src/lib/api/http.ts` — the single axios instance; it must send the session cookie and handle unauthenticated responses in one place.
- `frontend/src/store/` — store, typed hooks and provider; an auth slice joins it.
- `frontend/src/features/health/` — the reference feature (api, slice, types, component, tests) to copy.
- `frontend/src/components/ui/button.tsx`, `frontend/src/lib/utils.ts`, `frontend/src/app/globals.css` — shadcn is installed with one component and its token CSS; the shared set grows from here.
- `compose.yaml` — db, api and web services; the mail catcher is added as a fourth.

### Established Patterns
- Backend: routes → controller → service → Prisma, enforced by lint; tests run against the real `opencrm_test` database.
- Frontend: feature folders, `createAsyncThunk` with explicit loading/success/error state, typed hooks only, types generated from the OpenAPI document (`api:types`).
- Zero-warning lint, kebab-case file names, short conventional commits enforced by hooks.

### Integration Points
- `backend/src/routes.ts` — the `/api/v1` router where `auth` and `users` routes mount.
- `frontend/src/app/layout.tsx` and `frontend/src/app/page.tsx` — the root layout gains the app shell and theme handling; the current home page is the Phase 1 status page.
- Route protection for signed-in and Admin-only screens is new; nothing exists for it yet.

</code_context>

<specifics>
## Specific Ideas

- The owner picked the non-recommended option twice, and both must be honoured: wrong passwords lock the account temporarily in addition to rate limiting (D-04), and phones get a bottom tab bar with "More" in place of a slide-in drawer (D-13).
- Layout sketch the owner chose for navigation:

  ```
  Desktop                         Phone
  +--------+------------------+   +------------------+
  | OpenCRM|          (o) Me v|   | OpenCRM      (o) |
  |--------+------------------|   |------------------|
  | Home   |                  |   |                  |
  | Users  |   page content   |   |   page content   |
  |        |                  |   |------------------|
  |        |                  |   | Home Users  More |
  +--------+------------------+   +------------------+
  ```

- Admin visibility matters most to the owner, so user history must survive deactivation (D-19): later timelines still show who logged what.
- The Home page is a placeholder by design; do not build dashboard figures here.

</specifics>

<deferred>
## Deferred Ideas

None raised by the owner — discussion stayed within phase scope. Options that were offered and declined, so they are not built in this phase: an active-sessions list on the profile page, a "Remember me" checkbox, Admin-set temporary passwords, permanent deletion of never-activated users, and self-service email change with confirmation.

</deferred>

---

*Phase: 2-Authentication, Users & App Shell*
*Context gathered: 2026-10-08*
