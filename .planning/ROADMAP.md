# Roadmap: OpenCRM

## Overview

OpenCRM is built as vertical slices on top of one enforced foundation. Phase 1 lays the repository down (separate `frontend/`, `backend/` and reserved `mobile/` folders, written standards, lint/format/type checks, commit hook, CI and security tracking) and proves the stack end to end; every later phase follows those standards unchanged. Phases 2-4 deliver the core value early: people can sign in and be given roles, sales reps capture leads that are isolated per rep, and every lead carries a dated conversation timeline that admins and managers can read. Phases 5-6 widen the sales workflow (contacts, companies, the opportunity pipeline, lead conversion, tasks, reminders and the dashboard). Phases 7-8 add the later modules: custom fields, CSV import/export, email integration, and quotes/invoices. From Phase 2 onward each phase ships API and UI together and treats the shared responsive UI rules (UI-01..03) as a success criterion on every new screen.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Repository Foundation & Standards** - Monorepo layout, written standards, enforced checks, commit hook, CI, security tracking, and a walking skeleton that proves the stack
- [ ] **Phase 2: Authentication, Users & App Shell** - Sign-in, password reset, profile, admin user and role management, API hardening, and the shared responsive UI
- [ ] **Phase 3: Leads & Record Access** - Lead capture and assignment with per-role record isolation enforced by the API
- [ ] **Phase 4: Conversation Log & Activity Timeline** - Dated conversations and notes on leads, a tamper-evident timeline, and the admin/manager activity feed
- [ ] **Phase 5: Contacts, Companies & Opportunity Pipeline** - Customer records, pipeline board, won/lost closing, and lead conversion
- [ ] **Phase 6: Tasks, Reminders & Dashboard** - Follow-up tasks, in-app and email reminders, notifications, and role-aware dashboards
- [ ] **Phase 7: Custom Fields & CSV Import/Export** - Admin-defined fields on core records, plus CSV import with error reporting and CSV export
- [ ] **Phase 8: Email, Quotes & Invoices** - SMTP settings, email from records, templates, product catalog, quotes with PDF, and invoices

## Phase Details

### Phase 1: Repository Foundation & Standards

**Goal:** As a contributor, I want to run the full stack locally with enforced standards, CI and security tracking, so that every later phase is built the same way.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-07, FND-08, CTB-01, CTB-02, CTB-03, CTB-04, CTB-05, CI-01, CI-02, SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):

  1. Following only the README, a contributor starts the database, API and web app locally, and the web home page shows live status that was loaded through the Redux Toolkit store (typed hooks) from the API's versioned health endpoint, which itself reads from PostgreSQL (the walking skeleton).
  2. The repository has separate `frontend/` (Next.js), `backend/` (Express + Prisma) and reserved `mobile/` folders, and a written standards document defines folder structure, naming, the backend layering (routes, controllers, services, Prisma data access) and the frontend slice/API-call pattern, which the skeleton code already follows.
  3. One command per app runs lint, format check and strict TypeScript check and fails on any violation; starting the API with a missing or invalid environment variable fails immediately with a clear message, and each app documents its variables in `.env.example`; the API serves a versioned OpenAPI document.
  4. A commit whose message breaks the documented standard is rejected locally by a commit hook, a pull request that breaks it fails CI, and GitHub Actions run lint, type-check, test and build for both apps on every push and pull request.
  5. The repository ships LICENSE (Apache-2.0), CONTRIBUTING, CODE_OF_CONDUCT, PR and issue templates, documented branch/PR rules, and SECURITY.md, with Dependabot, CodeQL (on pull requests and on a schedule) and secret scanning configured so that a committed credential is caught.

**Plans:** 9/10 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Pin the three dependency manifests and get owner approval before any install

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Tracer part 1: API health reads PostgreSQL in Compose; apply the Prisma schema

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Tracer part 2: home page shows live status through the Redux store; README quick start

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-04-PLAN.md — Backend check command, build, and test harness on a real test database
- [x] 01-06-PLAN.md — Frontend check command, env validation, slice and component tests

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-05-PLAN.md — API contract: error codes, validation path, request logging, OpenAPI document

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 01-07-PLAN.md — Status page complete: Tailwind and shadcn, OpenAPI-derived types, error-code state

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 01-08-PLAN.md — Commit standard, commitlint, lint-staged, husky hooks, staged secret scan
- [x] 01-09-PLAN.md — Standards documents, decision records, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT

**Wave 8** *(blocked on Wave 7 completion)*

- [ ] 01-10-PLAN.md — CI, PR title check, CodeQL, Dependabot, audit, SECURITY.md, foundation verifier

### Phase 2: Authentication, Users & App Shell

**Goal:** As a team admin, I want to sign in, invite my team and give each person a role, so that my sales team can use OpenCRM securely from any device.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, ROLE-01, ROLE-02, ROLE-03, SEC-05, UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):

  1. On a fresh install the first visitor creates the initial Admin account; afterwards any user can log in with email and password, stays logged in across a browser refresh, and can log out.
  2. A user who forgot their password requests an emailed link, sets a new password from it and logs in; a logged-in user can update their own profile and change their password.
  3. An Admin can invite a user, edit them, deactivate them (they can no longer log in) and reactivate them, give each user exactly one of the four roles (Admin, Sales Manager, Sales Rep, Read-only), and assign reps to a manager's team; non-admins cannot open these screens or call these API routes.
  4. The API sends security headers, accepts requests only from allow-listed origins, rate-limits the auth routes, and answers invalid input on every endpoint with the same structured validation error.
  5. Login, profile and user-management screens are usable at phone, tablet and desktop widths with no horizontal page scroll, are built from one shared component set and design tokens, and show consistent loading, empty and error states.

**Plans**: TBD
**UI hint**: yes

### Phase 3: Leads & Record Access

**Goal:** As a sales rep, I want to capture and work the leads assigned to me, so that I see only my records while managers see their team's and admins see everything.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: LEAD-01, LEAD-02, LEAD-03, LEAD-05, ROLE-04, ROLE-05, ROLE-06, ROLE-07, ROLE-08
**Success Criteria** (what must be TRUE):

  1. A user can create, view, edit and delete a lead with a source and status, and can search, filter (status, owner, source) and sort the lead list, on phone, tablet and desktop alike.
  2. An Admin or Manager can assign and reassign a lead to a sales rep, and a user can mark a lead as lost with a reason.
  3. A Sales Rep sees and edits only the leads assigned to them, a Sales Manager sees and edits leads owned by reps on their team, and an Admin sees and edits every lead.
  4. A Read-only user can view the leads they are allowed to see but has no way to create, edit, assign or delete anything.
  5. Calling the API directly with another rep's lead ID, or as a Read-only user attempting a change, is refused by the API; the rules are not just hidden in the UI.

**Plans**: TBD
**UI hint**: yes

### Phase 4: Conversation Log & Activity Timeline

**Goal:** As a sales rep, I want to log dated conversations and notes on a lead, so that admins and managers can see the full history and what each person did.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: CONV-01, CONV-02, CONV-03, CONV-04, CONV-05
**Success Criteria** (what must be TRUE):

  1. A user can log a conversation on a lead with a date, a type (call, meeting, email, message) and what was discussed, and can add a plain note to the lead.
  2. Each lead page shows a dated timeline combining conversations, notes and status changes, and every entry shows who made it and when.
  3. Timeline entries cannot be silently altered: any edit or removal of an entry leaves a visible trace showing that it changed, who changed it and when.
  4. An Admin or Manager can open an activity feed of what each sales person did, filter it by person and date range, and sees only the people within their own scope (a Manager sees their team).

**Plans**: TBD
**UI hint**: yes

### Phase 5: Contacts, Companies & Opportunity Pipeline

**Goal:** As a sales rep, I want to convert a qualified lead into a contact, company and opportunity and move the deal through pipeline stages, so that I can track every deal to won or lost.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: CONT-01, CONT-02, CONT-03, CONT-04, OPP-01, OPP-02, OPP-03, OPP-04, OPP-05, LEAD-04
**Success Criteria** (what must be TRUE):

  1. A user can create, view, edit and delete contacts and companies, link contacts to a company and see them on the company page, and can search, filter, sort and page through both lists.
  2. A user can create, edit and delete an opportunity with value, expected close date and owner, and can view opportunities as a stage board and as a filterable list.
  3. A user can move an opportunity between pipeline stages on the board and close it as won or lost with a reason; an Admin can configure the pipeline stages.
  4. A user can convert a lead into a contact, company and opportunity in one action, and the lead's conversations, notes and history stay visible on the resulting records.
  5. Conversations, notes and the dated timeline from Phase 4 are available on contacts and opportunities as well as leads, the same role-based record isolation applies to them, and all new screens work from phone to desktop.

**Plans**: TBD
**UI hint**: yes

### Phase 6: Tasks, Reminders & Dashboard

**Goal:** As a sales rep, I want to schedule follow-up tasks and reminders and see my work on a dashboard, so that no lead goes cold and managers can see each rep's progress.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, DASH-01, DASH-02, DASH-03
**Success Criteria** (what must be TRUE):

  1. A user can create a task linked to a record with a due date, assignee and status, sees their tasks grouped as overdue, due today and upcoming, and task activity appears on the record's timeline.
  2. A user can set a follow-up reminder on a lead, opportunity or task, and when it comes due they receive both an in-app notification and an email.
  3. A user sees an unread notification count and can mark notifications as read.
  4. A user's dashboard shows their open leads, pipeline value by stage and tasks due, and is usable on phone, tablet and desktop.
  5. An Admin or Manager sees per-rep figures (leads handled, conversations logged, opportunities won and lost) within their scope, and a Sales Rep never sees another rep's numbers.

**Plans**: TBD
**UI hint**: yes

### Phase 7: Custom Fields & CSV Import/Export

**Goal:** As a team admin, I want to define custom fields and import or export records as CSV, so that OpenCRM fits my team's data and I can bring in existing leads.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: CF-01, CF-02, CF-03, DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):

  1. An Admin can add custom fields (text, number, date, dropdown) to contacts, companies, leads and opportunities.
  2. A user can fill in custom fields on record forms and sees them on record pages, and can filter lists by custom field values.
  3. A user can import contacts, companies and leads from a CSV file by mapping its columns, and afterwards sees which rows failed and why.
  4. A user can export any list they can see to CSV, and the export contains only records that user is allowed to access.

**Plans**: TBD
**UI hint**: yes

### Phase 8: Email, Quotes & Invoices

**Goal:** As a sales rep, I want to email contacts from a record and send quotes that become invoices, so that all customer communication and billing is tracked on the deal.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: MAIL-01, MAIL-02, MAIL-03, MAIL-04, QUOT-01, QUOT-02, QUOT-03, QUOT-04, QUOT-05
**Success Criteria** (what must be TRUE):

  1. An Admin can configure outgoing SMTP settings in the app, and a user can save and reuse email templates.
  2. A user can send an email to a contact from a record, and the sent email appears on that record's timeline.
  3. An Admin can manage a product catalog with prices, and a user can build a quote on an opportunity with line items, discount and tax.
  4. A user can download a quote as a PDF and email it to the contact.
  5. A user can turn an accepted quote into an invoice and mark the invoice as sent, paid or overdue.

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 (decimal insertions run between their surrounding integers)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Repository Foundation & Standards | 9/10 | In Progress|  |
| 2. Authentication, Users & App Shell | 0/TBD | Not started | - |
| 3. Leads & Record Access | 0/TBD | Not started | - |
| 4. Conversation Log & Activity Timeline | 0/TBD | Not started | - |
| 5. Contacts, Companies & Opportunity Pipeline | 0/TBD | Not started | - |
| 6. Tasks, Reminders & Dashboard | 0/TBD | Not started | - |
| 7. Custom Fields & CSV Import/Export | 0/TBD | Not started | - |
| 8. Email, Quotes & Invoices | 0/TBD | Not started | - |
