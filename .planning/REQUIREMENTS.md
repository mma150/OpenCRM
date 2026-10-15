# Requirements: OpenCRM

**Defined:** 2026-10-08
**Core Value:** A sales person can log every lead and every conversation against it, and an admin can open any lead and see the dated history of what was discussed and what happens next.

## v1 Requirements

Requirements for the first release (web + API). Each maps to roadmap phases.

### Foundation & Standards

- [x] **FND-01**: Repository has separate top-level `frontend/`, `backend/` and `mobile/` folders, each with the conventional structure for its stack
- [x] **FND-02**: Contributor can read a written standards document covering folder structure, naming, and code conventions for frontend and backend
- [x] **FND-03**: Lint, format and TypeScript strict checks run with one command per app and fail on violations
- [x] **FND-04**: Contributor can start the full stack locally (database, API, web) by following the README
- [x] **FND-05**: Frontend has a Redux Toolkit store with typed `useAppDispatch` / `useAppSelector` hooks and a documented pattern for slices and API calls
- [x] **FND-06**: Backend has a documented layered structure (routes, controllers, services, Prisma data access) with central error handling and request validation
- [x] **FND-07**: API is versioned and documented (OpenAPI) so web and mobile clients share one contract
- [x] **FND-08**: Environment configuration is validated at startup and documented in `.env.example` files

### Contribution & Commits

- [x] **CTB-01**: Repository has CONTRIBUTING, CODE_OF_CONDUCT and Apache-2.0 LICENSE files
- [x] **CTB-02**: Repository has pull request and issue templates
- [x] **CTB-03**: Commit message standard is documented (short conventional messages, no AI attribution trailers)
- [x] **CTB-04**: Commits that break the message standard are rejected by a local commit hook
- [x] **CTB-05**: Branch and pull request rules are documented (branch naming, review, required checks)

### CI & Security

- [x] **CI-01**: GitHub Actions run lint, type-check, test and build for frontend and backend on every push and pull request
- [x] **CI-02**: Pull request titles/commits are checked against the commit standard in CI
- [x] **SEC-01**: Dependency vulnerabilities are reported automatically (Dependabot alerts and update PRs)
- [x] **SEC-02**: Code scanning (CodeQL) runs on pull requests and on a schedule
- [x] **SEC-03**: Secret scanning blocks committed credentials
- [x] **SEC-04**: Repository has a SECURITY.md describing how to report a vulnerability
- [ ] **SEC-05**: API applies baseline hardening: security headers, CORS allow-list, rate limiting on auth routes, and input validation on every endpoint

### Authentication

- [ ] **AUTH-01**: User can log in with email and password
- [ ] **AUTH-02**: User session persists across browser refresh and can be ended by logging out
- [ ] **AUTH-03**: User can reset a forgotten password via an emailed link
- [ ] **AUTH-04**: First run creates the initial Admin account
- [ ] **AUTH-05**: User can update their own profile and password

### Users & Roles

- [ ] **ROLE-01**: Admin can invite, edit, deactivate and reactivate users
- [ ] **ROLE-02**: Admin can assign each user one role: Admin, Sales Manager, Sales Rep or Read-only
- [ ] **ROLE-03**: Admin can assign sales reps to a manager's team
- [ ] **ROLE-04**: Sales Rep can see and edit only the records assigned to them
- [ ] **ROLE-05**: Sales Manager can see and edit records owned by reps on their team
- [ ] **ROLE-06**: Admin can see and edit every record
- [ ] **ROLE-07**: Read-only user can view records but cannot change anything
- [ ] **ROLE-08**: Access rules are enforced by the API, not only hidden in the UI

### Contacts & Companies

- [ ] **CONT-01**: User can create, view, edit and delete a contact
- [ ] **CONT-02**: User can create, view, edit and delete a company
- [ ] **CONT-03**: User can link contacts to a company and see them on the company page
- [ ] **CONT-04**: User can search, filter, sort and page through contact and company lists

### Leads

- [ ] **LEAD-01**: User can create, view, edit and delete a lead with source and status
- [ ] **LEAD-02**: Admin or manager can assign or reassign a lead to a sales rep
- [ ] **LEAD-03**: User can search, filter (status, owner, source) and sort the lead list
- [ ] **LEAD-04**: User can convert a lead into a contact, company and opportunity, keeping its history
- [ ] **LEAD-05**: User can mark a lead as lost with a reason

### Opportunities

- [ ] **OPP-01**: User can create, view, edit and delete an opportunity with value, expected close date and owner
- [ ] **OPP-02**: User can move an opportunity between pipeline stages on a board view
- [ ] **OPP-03**: User can view opportunities as a filterable list as well as a board
- [ ] **OPP-04**: User can close an opportunity as won or lost with a reason
- [ ] **OPP-05**: Admin can configure pipeline stages

### Conversations & Timeline

- [ ] **CONV-01**: User can log a conversation on a lead, opportunity or contact with date, type (call, meeting, email, message) and what was discussed
- [ ] **CONV-02**: User can add a plain note to any record
- [ ] **CONV-03**: User can see a dated timeline on each record combining conversations, notes, emails, tasks and status changes
- [ ] **CONV-04**: Admin or manager can view an activity feed of what each sales person did, filterable by person and date range
- [ ] **CONV-05**: Timeline entries record who made them and when, and cannot be silently altered

### Tasks & Reminders

- [ ] **TASK-01**: User can create a task linked to a record with due date, assignee and status
- [ ] **TASK-02**: User can see their tasks grouped as overdue, due today and upcoming
- [ ] **TASK-03**: User can set a follow-up reminder on a lead, opportunity or task
- [ ] **TASK-04**: User receives an in-app notification when a reminder is due
- [ ] **TASK-05**: User receives an email when a reminder is due
- [ ] **TASK-06**: User can mark notifications as read and see unread count

### Dashboard

- [ ] **DASH-01**: User sees a dashboard with their open leads, pipeline value by stage, and tasks due
- [ ] **DASH-02**: Admin or manager sees per-rep figures: leads handled, conversations logged, opportunities won/lost
- [ ] **DASH-03**: Dashboard figures respect the viewer's role (a rep never sees another rep's numbers)

### Import & Export

- [ ] **DATA-01**: User can import contacts, companies and leads from a CSV file with column mapping
- [ ] **DATA-02**: User sees which rows failed import and why
- [ ] **DATA-03**: User can export any list they can see to CSV

### Custom Fields

- [ ] **CF-01**: Admin can add custom fields (text, number, date, dropdown) to contacts, companies, leads and opportunities
- [ ] **CF-02**: User can fill in custom fields on record forms and see them on record pages
- [ ] **CF-03**: User can filter lists by custom field values

### Email

- [ ] **MAIL-01**: Admin can configure outgoing SMTP settings
- [ ] **MAIL-02**: User can send an email to a contact from a record
- [ ] **MAIL-03**: Sent emails appear on the record's timeline
- [ ] **MAIL-04**: User can save and reuse email templates

### Products, Quotes & Invoices

- [ ] **QUOT-01**: Admin can manage a product catalog with prices
- [ ] **QUOT-02**: User can create a quote on an opportunity with line items, discount and tax
- [x] **QUOT-03**: User can download a quote as PDF and email it to the contact
- [ ] **QUOT-04**: User can turn an accepted quote into an invoice
- [ ] **QUOT-05**: User can mark an invoice as sent, paid or overdue

### Responsive UI

- [ ] **UI-01**: Every screen is usable at phone, tablet and desktop widths with no horizontal page scroll
- [ ] **UI-02**: App uses one shared set of UI components and design tokens across all screens
- [ ] **UI-03**: Lists, forms and empty/loading/error states behave consistently on every module

## v2 Requirements

Deferred to a future release. Tracked but not in the current roadmap.

### Mobile

- **MOB-01**: Flutter app for sales reps covering leads, conversations, tasks and reminders
- **MOB-02**: Push notifications for reminders

### Authentication

- **AUTH-06**: Sign in with Google / Microsoft
- **AUTH-07**: Two-factor authentication

### Email

- **MAIL-05**: Two-way email sync (IMAP / Gmail / Outlook) logging incoming replies

### Platform

- **PLAT-01**: Custom roles with an editable permission matrix
- **PLAT-02**: Webhooks and public API keys for integrations
- **PLAT-03**: Report builder with saved reports
- **PLAT-04**: Multi-language interface

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-tenant / SaaS mode | One organisation per install keeps the data model simple for contributors |
| Marketing automation (campaigns, sequences) | Not core to tracking sales work |
| Telephony / call recording | Heavy third-party integration |
| AI scoring and summaries | Defer until the core workflow is validated |
| Online payments for invoices | Invoices are records only; payment processing adds compliance burden |
| Real-time chat between users | Not needed to track sales activity |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 | Complete |
| FND-02 | Phase 1 | Complete |
| FND-03 | Phase 1 | Complete |
| FND-04 | Phase 1 | Complete |
| FND-05 | Phase 1 | Complete |
| FND-06 | Phase 1 | Complete |
| FND-07 | Phase 1 | Complete |
| FND-08 | Phase 1 | Complete |
| CTB-01 | Phase 1 | Complete |
| CTB-02 | Phase 1 | Complete |
| CTB-03 | Phase 1 | Complete |
| CTB-04 | Phase 1 | Complete |
| CTB-05 | Phase 1 | Complete |
| CI-01 | Phase 1 | Complete |
| CI-02 | Phase 1 | Complete |
| SEC-01 | Phase 1 | Complete |
| SEC-02 | Phase 1 | Complete |
| SEC-03 | Phase 1 | Complete |
| SEC-04 | Phase 1 | Complete |
| SEC-05 | Phase 2 | Pending |
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| AUTH-04 | Phase 2 | Pending |
| AUTH-05 | Phase 2 | Pending |
| ROLE-01 | Phase 2 | Pending |
| ROLE-02 | Phase 2 | Pending |
| ROLE-03 | Phase 2 | Pending |
| ROLE-04 | Phase 3 | Pending |
| ROLE-05 | Phase 3 | Pending |
| ROLE-06 | Phase 3 | Pending |
| ROLE-07 | Phase 3 | Pending |
| ROLE-08 | Phase 3 | Pending |
| CONT-01 | Phase 5 | Pending |
| CONT-02 | Phase 5 | Pending |
| CONT-03 | Phase 5 | Pending |
| CONT-04 | Phase 5 | Pending |
| LEAD-01 | Phase 3 | Pending |
| LEAD-02 | Phase 3 | Pending |
| LEAD-03 | Phase 3 | Pending |
| LEAD-04 | Phase 5 | Pending |
| LEAD-05 | Phase 3 | Pending |
| OPP-01 | Phase 5 | Pending |
| OPP-02 | Phase 5 | Pending |
| OPP-03 | Phase 5 | Pending |
| OPP-04 | Phase 5 | Pending |
| OPP-05 | Phase 5 | Pending |
| CONV-01 | Phase 4 | Pending |
| CONV-02 | Phase 4 | Pending |
| CONV-03 | Phase 4 | Pending |
| CONV-04 | Phase 4 | Pending |
| CONV-05 | Phase 4 | Pending |
| TASK-01 | Phase 6 | Pending |
| TASK-02 | Phase 6 | Pending |
| TASK-03 | Phase 6 | Pending |
| TASK-04 | Phase 6 | Pending |
| TASK-05 | Phase 6 | Pending |
| TASK-06 | Phase 6 | Pending |
| DASH-01 | Phase 6 | Pending |
| DASH-02 | Phase 6 | Pending |
| DASH-03 | Phase 6 | Pending |
| DATA-01 | Phase 7 | Pending |
| DATA-02 | Phase 7 | Pending |
| DATA-03 | Phase 7 | Pending |
| CF-01 | Phase 7 | Pending |
| CF-02 | Phase 7 | Pending |
| CF-03 | Phase 7 | Pending |
| MAIL-01 | Phase 8 | Pending |
| MAIL-02 | Phase 8 | Pending |
| MAIL-03 | Phase 8 | Pending |
| MAIL-04 | Phase 8 | Pending |
| QUOT-01 | Phase 8 | Pending |
| QUOT-02 | Phase 8 | Pending |
| QUOT-03 | Phase 8 | Complete |
| QUOT-04 | Phase 8 | Pending |
| QUOT-05 | Phase 8 | Pending |
| UI-01 | Phase 2 | Pending |
| UI-02 | Phase 2 | Pending |
| UI-03 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 79 total
- Mapped to phases: 79
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-08*
*Last updated: 2026-10-08 after roadmap creation*
