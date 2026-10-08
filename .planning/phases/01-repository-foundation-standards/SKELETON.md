# Walking Skeleton — OpenCRM

**Phase:** 1
**Generated:** 2026-10-08

## Capability Proven End-to-End

A contributor runs `docker compose up`, opens the web home page, and sees the API status and the PostgreSQL server time, loaded by a Redux Toolkit thunk through the shared axios instance from `GET /api/v1/health`, which reads PostgreSQL through Prisma; pressing Refresh loads it again.

The skeleton is proven in two consecutive tracer tasks because one full-stack greenfield tracer would be about 29 new files in a single task:

| Tracer | Plan | Wave | Path proven |
|---|---|---|---|
| Part 1 | 01-02 | 2 | Compose -> Express route -> controller -> service -> Prisma -> PostgreSQL -> response envelope |
| Part 2 | 01-03 | 3 | Browser -> page -> feature component -> thunk -> axios -> API (CORS) -> store -> typed hooks |

Plan 01-01 (wave 1) precedes both: it only pins and gets owner approval for the dependency manifests, because nothing may be installed before that review. Every other plan depends on 01-03, so expansion starts only after the full path works.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework (web) | Next.js 16.4.0 App Router, React 19.3.0, TypeScript 6.0.3 | Owner's stack (D-07); route files stay thin and delegate to feature folders |
| Framework (API) | Express 5.2.1 on Node 24, ESM, run with tsx in development and bundled with tsup | Owner's stack; Express 5 forwards rejected async handlers to one error handler |
| State and data fetching | Redux Toolkit 2.13.0 `createAsyncThunk` plus one shared axios 1.20.0 instance; typed `useAppDispatch` / `useAppSelector`; no RTK Query | Owner decision D-06 (costly to change); one copyable slice pattern for every feature |
| Data layer | PostgreSQL 18 through Prisma 7.10.0 with the pg driver adapter; no models in Phase 1; schema applied with `prisma migrate deploy` | Stable Prisma line; the health read is `SELECT now()`, the first real migration is Phase 2's |
| API contract | Versioned prefix `/api/v1`; envelope `{ data, meta }` / `{ error: { code, message, details } }`; stable error codes; OpenAPI 3.1 generated from Zod schemas, served and committed | D-10, D-11, D-12 (costly to change); web and the later Flutter client share one contract |
| Frontend types | Generated from the committed `backend/openapi/openapi.json` with openapi-typescript | D-02: the frontend never imports backend code |
| Auth | None in Phase 1 | Authentication, sessions and roles are Phase 2 |
| Styling | Tailwind CSS 4 with shadcn/ui, used only on the status page | D-08; the shared component set is Phase 2 |
| Deployment target | Local development only: one Docker Compose file with `db`, `api`, `web`, source bind-mounted, polling file watchers, webpack mode for the web container | Owner decision D-03; measured on Docker Desktop for Windows |
| Directory layout | `frontend/src/features/<feature>/` mirrors `backend/src/modules/<module>/`; kebab-case file names; two independent apps with their own lockfiles plus a tooling-only root package | D-05, D-09, D-20, D-02 (costly to change); a contributor finds a feature from folder names |
| Configuration | Per-app `.env` with committed `.env.example`, validated by a Zod env module at startup | D-25 |
| Quality gates | Per-app `pnpm check` (ESLint zero warnings, Prettier, strict TypeScript), Vitest on both sides, husky commit hooks, GitHub Actions | D-13, D-14, D-17 |

## Stack Touched in Phase 1

- [ ] Project scaffold (framework, build, lint, test runner) — plans 01-01, 01-04, 01-06
- [ ] Routing — `GET /api/v1/health` (API) and `/` (web) — plans 01-02, 01-03
- [ ] Database — one real read (`SELECT now()` through Prisma) in plan 01-02. No write: Phase 1 has no model; the first real write arrives with Phase 2's users table
- [ ] UI — the status panel with a Refresh button that re-dispatches the thunk — plan 01-03
- [ ] Deployment — documented local full-stack run command, `docker compose up`, in README Quick start — plan 01-03

## Out of Scope (Deferred to Later Slices)

- Authentication, sessions, users, roles and API rate limiting (Phase 2; SEC-05)
- Any Prisma model or migration (Phase 2 creates the first one)
- The shared UI component set, design tokens and app shell (Phase 2; UI-01 to UI-03)
- Leads, conversations, contacts, opportunities, tasks and every other CRM feature (Phases 3-8)
- An API documentation user interface (only the JSON document is served)
- Production Docker images, hosting and deployment
- The Flutter app (`mobile/` is reserved only)
- A repository layer between services and Prisma
- Path-filtered CI

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: a team admin signs in, invites users and assigns roles (first Prisma models, auth routes, app shell)
- Phase 3: a sales rep captures and works leads isolated per role
- Phase 4: dated conversations, notes and a tamper-evident timeline on leads
- Phase 5: contacts, companies, the opportunity pipeline and lead conversion
- Phase 6: tasks, reminders, notifications and dashboards
- Phase 7: custom fields and CSV import and export
- Phase 8: email from records, quotes and invoices
