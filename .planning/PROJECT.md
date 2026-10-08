# OpenCRM

## What This Is

OpenCRM is an open source, self-hosted CRM for small sales teams (roughly 5–50 people). Sales people track their own leads, opportunities, follow-ups and customer conversations; admins and managers see exactly what the sales team is doing and when. It ships first as a responsive web app (Next.js frontend, Node/Express/Prisma backend), with a Flutter mobile app to follow.

## Core Value

A sales person can log every lead and every conversation against it, and an admin can open any lead and see the dated history of what was discussed and what happens next.

## Requirements

### Validated

(None yet — ship to validate)

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

- [ ] Separate top-level folders per app (`frontend/`, `backend/`, `mobile/`), each following the conventional structure for its stack
- [ ] Written code standards and folder conventions, defined in the first phase and enforced by lint/format/type checks
- [ ] Redux Toolkit store with typed hooks as the single state pattern on the frontend
- [ ] Contributor rules: CONTRIBUTING, code of conduct, PR and issue templates
- [ ] Commit message standard (short conventional messages), enforced on commit
- [ ] GitHub Actions running lint, type-check, test and build on every push and pull request
- [ ] Security tracking: dependency vulnerability alerts, code scanning, secret scanning, and a SECURITY.md disclosure policy

### Out of Scope

- Flutter mobile app — planned as its own milestone after web and API are solid; only the `mobile/` folder is reserved now
- Multi-tenant / SaaS mode — one organisation per install keeps the data model simple and easy for contributors to follow
- Marketing automation (campaigns, sequences, drip email) — not core to tracking sales work
- Telephony / call recording — heavy integration, not needed for v1
- AI features (scoring, summaries) — defer until the core is validated

## Context

- Greenfield project in an empty repository; nothing exists yet.
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
*Last updated: 2026-10-08 after initialization*
