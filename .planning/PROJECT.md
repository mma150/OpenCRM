# OpenCRM

## What This Is

OpenCRM is an open source, self-hosted CRM for small sales teams (roughly 5–50 people). Sales people track their own leads, opportunities, follow-ups and customer conversations; admins and managers see exactly what the sales team is doing and when. It ships first as a responsive web app (Next.js frontend, Node/Express/Prisma backend), with a Flutter mobile app to follow.

## Core Value

A sales person can log every lead and every conversation against it, and an admin can open any lead and see the dated history of what was discussed and what happens next.

## Requirements

### Validated

- ✓ Separate top-level folders per app (`frontend/`, `backend/`, `mobile/`), each following the conventional structure for its stack — Phase 1
- ✓ Written code standards and folder conventions, enforced by lint/format/type checks — Phase 1
- ✓ Redux Toolkit store with typed hooks as the single state pattern on the frontend — Phase 1
- ✓ Contributor rules: CONTRIBUTING, code of conduct, PR and issue templates — Phase 1 (owner contact placeholders still to fill before the repo is public)
- ✓ Commit message standard (short conventional messages), enforced on commit — Phase 1

### Active

**Product**

- [ ] Authentication with role-based access control (roles: Admin, Sales Manager, Sales Rep, Read-only; permission-based so more roles can be added)
- [ ] Record isolation: a sales rep sees only the leads/opportunities assigned to them; managers see their team's; admins see everything
- [ ] Contacts and companies
- [ ] Leads, with conversion into an opportunity
- [ ] Opportunities (deals) moving through a pipeline of stages
- [ ] Conversation log on every lead/opportunity/contact: dated entries ("on this date we discussed this"), visible to admins as a timeline
- [ ] Tasks and activities
- [ ] Reminders for follow-ups, delivered in-app and by email
- [ ] Notes on records
- [ ] Dashboard showing pipeline and sales activity per person
- [ ] CSV import and export
- [ ] Custom fields on core records
- [ ] Email integration: send from a record over SMTP and log it on the timeline
- [ ] Products, quotes and simple invoices attached to opportunities
- [ ] Every screen responsive from phone width to desktop

**Project foundation**

- [ ] GitHub Actions running lint, type-check, test and build on every push and pull request — workflows written in Phase 1; not yet observed running because there is no GitHub repository
- [ ] Security tracking: dependency vulnerability alerts, code scanning, secret scanning, and a SECURITY.md disclosure policy — configured in Phase 1; not yet observed running because there is no GitHub repository

### Out of Scope

- Flutter mobile app — planned as its own milestone after web and API are solid; only the `mobile/` folder is reserved now
- Multi-tenant / SaaS mode — one organisation per install keeps the data model simple and easy for contributors to follow
- Marketing automation (campaigns, sequences, drip email) — not core to tracking sales work
- Telephony / call recording — heavy integration, not needed for v1
- AI features (scoring, summaries) — defer until the core is validated

## Context

- Phase 1 delivered the repository foundation: a Compose stack (PostgreSQL, API, web) whose home page shows live API and database status, plus the standards, hooks and CI configuration. No auth or CRM features exist yet.
- The repository is local only; the owner decided no GitHub repository is needed for now, so the GitHub-side checks from Phase 1 are deferred until the first push.
- The owner wants admins to have real visibility into sales activity. The conversation log and per-rep isolation are the features called out most specifically, so they outrank the generic CRM modules when trade-offs arise.
- It is open source and expected to take outside contributors, which is why "easy to understand, easy to maintain" is a design goal and not just a preference: conventions must be written down, predictable and machine-enforced.
- Standards set in the first phase are meant to be followed unchanged in every later phase.
- The mobile app will consume the same REST API, so the API must be a clean, documented contract and not shaped around the web UI alone.

## Constraints

- **Tech stack**: Next.js + Redux Toolkit (frontend), Node + Express + Prisma (backend), Flutter (mobile, later) — chosen by the owner
- **Language**: TypeScript on frontend and backend — type safety and one language for contributors
- **Database**: PostgreSQL via Prisma — default assumption, not yet challenged by the owner
- **Tenancy**: single organisation per installation
- **License**: Apache-2.0
- **Design**: simple, readable code over clever abstractions; a new contributor should be able to find where a feature lives from the folder names
- **Responsive**: all web screens must work on phone, tablet and desktop
- **Commits**: short messages following the repo's commit standard; never include Claude co-author or AI attribution trailers
- **Security**: vulnerabilities must be tracked continuously in CI, not audited once

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Web + API first, Flutter later | Validate the core CRM before building a second client | — Pending |
| Single org per install | Simplest model; matches self-hosted small teams | — Pending |
| Four roles on a permission-based RBAC (Admin, Sales Manager, Sales Rep, Read-only) | Owner asked for "all roles a CRM requires"; permissions let more roles be added without code changes | — Pending |
| One repository with `frontend/`, `backend/`, `mobile/` folders | Owner asked for separate folders; one repo keeps issues, CI and standards in one place | — Pending |
| Redux Toolkit as the only frontend state pattern | Owner requirement; one pattern keeps the codebase predictable | — Pending |
| Reminders in-app and by email | Follow-ups must reach reps outside the app | — Pending |
| Apache-2.0 license | Permissive with a patent grant | — Pending |
| "Ponytail" indexing idea dropped | Owner said to ignore it | — Pending |
| Three independent pnpm projects (root tooling, `backend/`, `frontend/`), each with its own lockfile | Each app installs and builds on its own; no workspace coupling | ✓ Phase 1 |
| Backend layering routes → controllers → services, with services calling Prisma directly | One obvious place for each kind of code; enforced by lint | ✓ Phase 1 |
| Frontend data access through thunks and one axios instance, no RTK Query | One state pattern, as the owner asked | ✓ Phase 1 |
| Frontend API types generated from the committed OpenAPI document | Web and (later) mobile share one documented contract | ✓ Phase 1 |
| Geist font fetched from Google at build time; Vite `type: module` warning left in test output | Owner accepted both as they are (Phase 1 UAT) | ✓ Phase 1 |
| No GitHub repository for now | Owner decision during Phase 1 UAT; GitHub-side checks deferred to the first push | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-08 after Phase 1*
