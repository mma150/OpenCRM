# Folder structure and naming

Where things live, how they are named, and which files to create when you add a feature. The working example for everything here is the **health** feature: [`backend/src/modules/health/`](../../backend/src/modules/health/) on the API side and [`frontend/src/features/health/`](../../frontend/src/features/health/) on the web side. When this document and the code disagree, fix the document or open a discussion; do not quietly diverge.

Related: [backend standard](backend.md), [frontend standard](frontend.md), [testing standard](testing.md).

## Top-level layout

```text
opencrm/
├── frontend/      Next.js web app (App Router, Redux Toolkit, Tailwind, shadcn/ui)
├── backend/       Node/Express API with Prisma and PostgreSQL
├── mobile/        Reserved for the Flutter app (README only, no code yet)
├── docs/          standards/ (these documents) and decisions/ (one-page records)
├── scripts/       Repository-level helper scripts
├── .github/       GitHub Actions workflows, Dependabot config, issue and PR templates
├── compose.yaml   The whole development stack: db, mailpit, api, web
├── .nvmrc         The Node.js major version (24)
├── package.json   Tooling-only root package (commit tooling), see below
└── README.md  CONTRIBUTING.md  CODE_OF_CONDUCT.md  SECURITY.md  LICENSE
```

### Two independent apps (D-02)

`frontend/` and `backend/` are independent. Each has its own `package.json`, `pnpm-workspace.yaml` (pnpm settings, not a workspace of packages) and `pnpm-lock.yaml`. There is **no shared workspace package** and the frontend never imports backend code. The only thing the two share is the API contract: the backend generates `backend/openapi/openapi.json` from its Zod schemas, and the frontend generates `frontend/src/lib/api/schema.d.ts` from that file (see [backend.md](backend.md#openapi) and [frontend.md](frontend.md#generating-api-types)).

The root `package.json` exists only to hold the commit tooling (husky, lint-staged, commitlint). It has its own lockfile and is not a workspace containing the apps ([decision 0002](../decisions/0002-root-tooling-package.md)).

## Backend tree (`backend/`)

```text
backend/
├── package.json  pnpm-lock.yaml  pnpm-workspace.yaml  tsconfig.json  tsup.config.ts
├── eslint.config.mjs  prettier.config.mjs  vitest.config.ts  prisma.config.ts
├── .env.example  Dockerfile  docker/dev-entrypoint.sh
├── prisma/schema.prisma            Database schema
├── prisma/migrations/              One folder per migration; committed, never edited after merge
├── openapi/openapi.json            Generated API contract, committed
├── scripts/generate-openapi.ts     Writes openapi/openapi.json
├── test/global-setup.ts            Creates and migrates the opencrm_test database
├── test/helpers.ts                 Shared by tests: test app, users, signed-in agent, captured email
└── src/
    ├── server.ts                   Starts the HTTP listener and the reminder loop
    ├── app.ts                      createApp(): middleware order and router mounting
    ├── env.ts                      The only reader of process.env (validated with Zod)
    ├── routes.ts                   Mounts every module router under /api/v1, serves openapi.json
    ├── lib/                        Shared helpers: prisma.ts, logger.ts, openapi.ts, app-error.ts,
    │                               password.ts (+ common-passwords.txt), tokens.ts, sessions.ts,
    │                               session-cookie.ts, account-links.ts, mailer.ts (the only sender
    │                               of email, and which mail server is in effect), user-fields.ts,
    │                               record-access.ts (who may see and change an owned record),
    │                               record-owner.ts (a record's owner: the include, and the check
    │                               that a new owner is allowed), record-fields.ts (field schemas
    │                               the owned records share),
    │                               list-query.ts (search, sort and paging shared by every list),
    │                               timeline.ts (the TimelineEntry shape, the record types that
    │                               have a timeline, and addTimelineEntry, the one way an entry
    │                               is written), time-zone.ts (the `tz` parameter: the viewer's
    │                               day as exact moments), notifications.ts (addNotification, the
    │                               one way an in-app notification is written), reminders.ts
    │                               (the runner that fires due task reminders and follow-ups,
    │                               and the once-a-minute loop server.ts starts),
    │                               custom-fields.ts (custom field values on a record: checking,
    │                               storing, showing and filtering them), csv.ts (the CSV reader
    │                               and writer, and the guard against spreadsheet formulas),
    │                               csv-export.ts (what the export routes of the lists share),
    │                               route-docs.ts (OpenAPI sentences several route files share),
    │                               secret-box.ts (AES-256-GCM for the secrets the app stores),
    │                               sales-documents.ts (what quotes and invoices share: the
    │                               arithmetic, the numbering, a line, the print-ready document)
    ├── middleware/                 error-handler.ts, not-found.ts, authenticate.ts, require-role.ts,
    │                               origin-check.ts, rate-limit.ts
    ├── modules/
    │   ├── health/                 health.routes.ts  health.controller.ts  health.service.ts
    │   │                           health.schema.ts  health.test.ts
    │   ├── auth/                   Setup, sign-in, sessions, password reset, invites, own profile
    │   ├── users/                  Admin user management: invite, edit, deactivate, roles, managers;
    │   │                           and the list of users a record can be assigned to
    │   ├── leads/                  Leads: create, edit, list, assign, mark lost, delete, per-role access,
    │   │                           and converting a lead into a contact, company and opportunity
    │   ├── contacts/               Contacts: create, edit, list, assign, delete, link to a company
    │   ├── companies/              Companies: create, edit, list, assign, delete, the industries
    │   │                           in use, and how many contacts each has
    │   ├── pipeline-stages/        The stages of the one sales pipeline: list them, and (Admin)
    │   │                           add, rename, reorder and delete them
    │   ├── opportunities/          Opportunities: create, edit, list, the pipeline board, move
    │   │                           between stages, close as won or lost, reopen, assign, delete
    │   ├── timeline/               A record's timeline, for leads, contacts, companies and
    │   │                           opportunities: read it, log a conversation, add a note
    │   │                           (/<records>/:id/timeline, /conversations, /notes)
    │   ├── activity/               The team activity feed for Admins and Sales Managers, and the
    │   │                           people it can be filtered by
    │   ├── tasks/                  Tasks: create, edit, list, complete, reopen, delete, the
    │   │                           counts by due date, and who may see and be given one
    │   ├── notifications/          A user's own in-app notifications: list, unread count,
    │   │                           mark one or all as read
    │   ├── dashboard/              The figures on the home page: the caller's own work
    │   │                           (/dashboard/me) and one row per person (/dashboard/team)
    │   ├── custom-fields/          The custom fields an Admin adds to leads, contacts, companies
    │   │                           and opportunities: list, add, edit, reorder, archive, restore,
    │   │                           delete. The values live on the records (lib/custom-fields.ts)
    │   ├── imports/                CSV import of leads, contacts and companies: the fields a
    │   │                           column can go to, the preview with a suggested mapping, and
    │   │                           the import itself with its per-row errors. (The CSV exports
    │   │                           are routes of the lists: /<records>/export and /tasks/export)
    │   ├── email-settings/         The outgoing mail server an Admin saves (/settings/email),
    │   │                           its test message, and whether email is on
    │   ├── organization/           The organisation's details and the defaults of a new quote
    │   │                           (/settings/organization)
    │   ├── email-templates/        Reusable emails, own and shared, and their placeholders
    │   ├── emails/                 Sending an email from a record, its preview and its
    │   │                           suggested recipients
    │   ├── products/               The product catalog: list it, and (Admin) add, edit,
    │   │                           archive, restore and delete
    │   ├── quotes/                 Quotes on an opportunity: lines and totals, send (and
    │   │                           email), accept, decline, reopen, duplicate, the print-ready
    │   │                           document; and POST /quotes/:id/invoice
    │   └── invoices/               Invoices made from accepted quotes: list, summary, mark
    │                               sent, paid, overdue, unpaid, void, restore, the document
    └── generated/prisma/           Prisma client; gitignored, recreated by `prisma generate`
```

## Frontend tree (`frontend/`)

```text
frontend/
├── package.json  pnpm-lock.yaml  pnpm-workspace.yaml  tsconfig.json  next.config.ts
├── eslint.config.mjs  prettier.config.mjs  postcss.config.mjs
├── vitest.config.ts  vitest.setup.ts  components.json  .env.example  Dockerfile
└── src/
    ├── app/                        Thin route files only: layout.tsx, globals.css and two route groups
    │   ├── (auth)/                 Signed-out pages: login, setup, forgot-password, reset-password, accept-invite
    │   ├── (app)/                  Signed-in pages inside the app frame: page.tsx (Home), profile, settings/users,
    │   │                           settings/pipeline, settings/custom-fields, import, leads (the list), leads/new, leads/[id], leads/[id]/edit,
    │   │                           and the same four routes under contacts/, companies/ and opportunities/
    │   │                           (whose first page is the board and the list), activity, tasks, notifications
    │   └── status/                 The API status page (no sign-in)
    ├── features/
    │   ├── health/                 health-status.tsx  health.slice.ts  health.api.ts
    │   │                           health.types.ts  and their *.test.ts(x) files
    │   ├── auth/                   auth.{types,api,slice}.ts, auth-gate.tsx, guest-gate.tsx, the forms, profile-page.tsx
    │   ├── users/                  users.{types,api,slice}.ts, users-page.tsx and its dialogs,
    │   │                           assignable-users.slice.ts (who a record may be assigned to),
    │   │                           use-owner-filter.ts (the Owner filter of a list of owned records)
    │   ├── leads/                  leads.{types,api,slice}.ts, leads-page.tsx (the list), lead-detail-page.tsx,
    │   │                           lead-form.tsx and lead-form-pages.tsx (new, edit), lead-dialogs.tsx,
    │   │                           convert-lead-dialog.tsx (a lead becomes a contact, company and opportunity),
    │   │                           lead-loader.tsx, lead-labels.ts, lead-status-badge.tsx, lead-picker.tsx
    │   ├── contacts/               contacts.{types,api,slice}.ts, contacts-page.tsx (the list), contact-detail-page.tsx,
    │   │                           contact-form.tsx and contact-form-pages.tsx (new, edit), contact-dialogs.tsx,
    │   │                           contact-loader.tsx, company-contacts.tsx (the Contacts card on a company's page),
    │   │                           contact-picker.tsx (the searchable contact picker and the Contact filter)
    │   ├── companies/              companies.{types,api,slice}.ts, companies-page.tsx (the list), company-detail-page.tsx,
    │   │                           company-form.tsx and company-form-pages.tsx (new, edit), company-dialogs.tsx,
    │   │                           company-loader.tsx, company-labels.ts, company-website.tsx (the website as a link),
    │   │                           company-picker.tsx (the searchable company picker and the Company filter)
    │   ├── opportunities/          opportunities.{types,api,slice}.ts (the list, the board and one opportunity),
    │   │                           opportunities-page.tsx (the Board / List switch, the toolbar), opportunity-board.tsx,
    │   │                           opportunity-list.tsx, opportunity-detail-page.tsx, stage-stepper.tsx,
    │   │                           opportunity-form.tsx and opportunity-form-pages.tsx (new, edit),
    │   │                           opportunity-dialogs.tsx (close as won or lost, reassign, delete),
    │   │                           use-opportunity-stage.ts (move and reopen), opportunity-loader.tsx,
    │   │                           opportunity-labels.ts, opportunity-stage-badge.tsx, record-opportunities.tsx
    │   │                           (the Opportunities card on a company's and a contact's page),
    │   │                           opportunity-picker.tsx
    │   ├── pipeline-stages/        pipeline-stages.{types,api,slice}.ts, use-pipeline-stages.ts, stage-labels.ts,
    │   │                           pipeline-settings-page.tsx (/settings/pipeline) and stage-dialogs.tsx
    │   ├── custom-fields/          custom-fields.{types,api,slice}.ts, use-custom-fields.ts, custom-field-labels.ts,
    │   │                           custom-fields-settings-page.tsx (/settings/custom-fields) and
    │   │                           custom-field-dialogs.tsx, record-custom-fields.tsx (the Custom fields card
    │   │                           of a record page)
    │   ├── imports/                The CSV import at /import: imports.{types,api}.ts (no slice: nothing of an
    │   │                           import is shown elsewhere), import-page.tsx (the three steps),
    │   │                           import-file-step.tsx, import-mapping-step.tsx, import-results-step.tsx,
    │   │                           import-labels.ts (the types, the limits, the template)
    │   ├── timeline/               A record's history, for any kind of record: record-types.ts (the one table of
    │   │                           record types: lead, contact, company, opportunity), timeline.{types,api,slice}.ts,
    │   │                           timeline.tsx (the card), timeline-composer.tsx (the form), timeline-entry.tsx,
    │   │                           timeline-entry-icon.tsx, timeline-labels.ts, log-conversation-button.tsx (phones)
    │   ├── activity/               The team feed at /activity: activity.{types,api,slice}.ts, activity-page.tsx,
    │   │                           activity-labels.ts
    │   ├── tasks/                  tasks.{types,api,slice}.ts, tasks-page.tsx (/tasks: the groups, the Done view),
    │   │                           task-row.tsx (one task with its checkbox), task-dialog.tsx (new, edit, delete),
    │   │                           task-record-picker.tsx, use-task-toggle.ts (complete and reopen),
    │   │                           task-labels.ts (groups, reminder choices), record-tasks.tsx (the Tasks card
    │   │                           on a lead, contact, company and opportunity page)
    │   ├── notifications/          notifications.{types,api,slice}.ts, notification-bell.tsx (the bell in the top
    │   │                           bar, its polling and its panel), notifications-page.tsx (/notifications),
    │   │                           notification-item.tsx (one notification, and what opening it does)
    │   └── dashboard/              Home: dashboard.{types,api,slice}.ts, dashboard-page.tsx, my-dashboard.tsx
    │                               (the tiles, lists and bars of the signed-in user), team-section.tsx (the team
    │                               table, Admin and Sales Manager), dashboard-labels.ts
    ├── components/
    │   ├── ui/                     shadcn/ui output (generated; excluded from strict lint)
    │   ├── app-shell/              The app frame: nav-items.ts, sidebar, bottom tab bar, top bar, user menu
    │   └── shared/                 ResponsiveList, ListToolbar, ListPagination, list-url-state, RecordLayout,
    │                               SegmentedControl, PageHeader, PageState, FormField, SelectControl,
    │                               PasswordInput, badges, ... and what every owned record shares:
    │                               record-list.tsx, record-menus.tsx, record-dialogs.tsx (reassign, delete),
    │                               record-loader.tsx, record-picker.tsx (search for one record: the company,
    │                               contact, lead and opportunity pickers are built on it), follow-up.tsx (the
    │                               follow-up reminder of a lead or an opportunity), custom-fields-form.tsx,
    │                               custom-fields-card.tsx and custom-fields-filter.tsx (the custom fields of a
    │                               record form, a record page and a list's filters), list-actions.tsx
    │                               (Export CSV and Import beside a list's "New" button)
    ├── lib/
    │   ├── api/http.ts             The one axios instance and the ApiError type
    │   ├── api/error-messages.ts   describeApiError: the words for every error code
    │   ├── api/download.ts         downloadExport: a list's CSV export as a file, with its headers
    │   ├── api/schema.d.ts         Generated from the OpenAPI document, committed, never edited
    │   └── utils.ts ...            Small helpers: cn, form-errors, validation, safe-next, return-to, format,
    │                               user-labels, use-is-phone, record-access (what a role may do with a record),
    │                               time-zone (the `tz` the API is sent), use-visible-height (full-screen dialogs),
    │                               use-preselected-record (the record a "new" form starts with, from the address),
    │                               save-file (hands a file to the browser's download folder)
    ├── store/                      index.ts (makeStore), hooks.ts (typed hooks), thunk.ts, store-provider.tsx
    ├── test/                       Test helpers: render-with-store.tsx, navigation-mock.ts
    └── env.ts                      The only reader of process.env (validated with Zod)
```

## The mirror rule

A backend **module** and the frontend **feature** for the same part of the product carry the **same name**: `backend/src/modules/leads/` pairs with `frontend/src/features/leads/`. A new contributor can find both halves of a feature from the folder name alone. Cross-feature code goes in the shared folders (`src/lib`, `src/store`, `src/components` on the frontend; `src/lib`, `src/middleware` on the backend), never inside another feature's folder.

## Naming (D-20)

- **Every file name is kebab-case**: `lead-list.tsx`, `leads.service.ts`, `error-handler.ts`. Enforced in both apps by the ESLint rule `unicorn/filename-case` (`kebabCase`); `pnpm --dir backend check` and `pnpm --dir frontend check` fail on a file such as `LeadList.tsx`.
- **React components are PascalCase only as identifiers**, never as file names: the component `HealthStatus` lives in `health-status.tsx`.
- Backend module files are `<module>.<role>.ts` with the roles `routes`, `controller`, `service`, `schema` and `test`. Frontend feature files are `<feature>.<role>.ts` with the roles `types`, `api`, `slice` (plus `test`); a component file is named after the component, such as `health-status.tsx`.
- Tests sit beside the code they test and end in `.test.ts` or `.test.tsx`.
- Functions and variables are camelCase, types and classes are PascalCase, constants that are real constants (such as `ERROR_CODES`) are UPPER_SNAKE_CASE. Thunks are named `<verb><Feature>` (`fetchHealth`); see [frontend.md](frontend.md).

## Adding a feature

For a feature called `leads`, create these files. Copy the health files and rename; do not invent a new shape.

**Backend**, in `backend/src/modules/leads/`:

1. `leads.schema.ts`: Zod schemas for input and output, with `.openapi("Name")` on those the contract should name. Import `z` from `../../lib/openapi`, never from `zod`.
2. `leads.service.ts`: business rules and Prisma calls. The only layer that touches Prisma. Throw `AppError` for expected failures.
3. `leads.controller.ts`: parse input with `schema.parse(...)`, call the service, send `{ data, meta }`.
4. `leads.routes.ts`: the Express router **and** the matching `registry.registerPath(...)` call beside it.
5. `leads.test.ts`: supertest tests against the real test database.

Then mount the router in `backend/src/routes.ts` (`router.use("/leads", leadsRouter)`), add the Prisma model and create a migration if the feature stores data (and delete its rows in `resetRecords()` or `resetDatabase()` in `backend/test/helpers.ts`), and run `pnpm --dir backend openapi:generate` so `backend/openapi/openapi.json` is updated and committed.

**Frontend**, in `frontend/src/features/leads/`:

1. Run `pnpm --dir frontend api:types` so `schema.d.ts` knows the new endpoints, and commit it.
2. `leads.types.ts`: types derived from the generated schema.
3. `leads.api.ts`: functions that call the shared `http` instance and return the unwrapped `data`.
4. `leads.slice.ts`: state, the `createAsyncThunk` thunks and the reducers.
5. One or more components, using only `useAppDispatch` and `useAppSelector`.
6. Tests for the slice and the components, mocking at `leads.api.ts`.

Then add the reducer to `makeStore` in `frontend/src/store/index.ts`, add a route file under `frontend/src/app/` that only renders the feature component, and add one line to `nav-items.ts` if the feature has a page of its own in the navigation.

A feature of **owned records** (leads, contacts, companies, opportunities) builds its list, record page and dialogs from the shared record components instead of copying another feature's: see [What owned records share](frontend.md#what-owned-records-share). Its form, record page and list show the record type's custom fields through the shared custom field components ([Custom fields](frontend.md#custom-fields)), and its list offers the export through `ListActions` ([Export and import](frontend.md#export-and-import)). If the record has a timeline, it adds one line to `RECORD_TYPES` in `frontend/src/features/timeline/record-types.ts` (see [The timeline](frontend.md#the-timeline)). If other records link to it, it gets a picker built on the shared `RecordPicker` (see [The record pickers](frontend.md#the-record-pickers)) and, on the pages of the records it belongs to, a short card passed as `extra` to `RecordLayout` (`record-opportunities.tsx` is the example).

A feature can span two backend modules' worth of screens only when each keeps its own folder: the pipeline's stages live in `features/pipeline-stages/` (the API module `pipeline-stages`), the opportunities that sit in them in `features/opportunities/`.

## Where configuration lives

- **Environment variables are per app** (D-25): `backend/.env.example` and `frontend/.env.example` are committed templates, and an optional, git-ignored `.env` next to each overrides them. Real `.env` files are never committed. Each app validates its variables with a Zod schema in `src/env.ts` at start-up, names the missing or invalid variable, and exits. Docker Compose reads the same files, then sets the few values that differ inside containers. Read configuration through `env` from `src/env.ts`, never `process.env` (lint-enforced, see [backend.md](backend.md#environment) and [frontend.md](frontend.md#environment)).
- **The Node.js major version** is pinned to the active LTS (D-04). It is written in [`.nvmrc`](../../.nvmrc), in `engines` in each `package.json`, and as the `NODE_VERSION` build argument of the `api` and `web` services in [`compose.yaml`](../../compose.yaml). Change all of them together; see [decision 0001](../decisions/0001-node-lts-pin.md).
- **The pnpm version** is the `packageManager` field of each `package.json`, activated through corepack.
- **Line endings** are LF everywhere, set in `.gitattributes`.
