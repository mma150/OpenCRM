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
├── compose.yaml   The whole development stack: db, api, web
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
├── prisma/schema.prisma            Database schema (no models yet; migrations/ appears with the first one)
├── openapi/openapi.json            Generated API contract, committed
├── scripts/generate-openapi.ts     Writes openapi/openapi.json
├── test/global-setup.ts            Creates and migrates the opencrm_test database
└── src/
    ├── server.ts                   Starts the HTTP listener
    ├── app.ts                      createApp(): middleware order and router mounting
    ├── env.ts                      The only reader of process.env (validated with Zod)
    ├── routes.ts                   Mounts every module router under /api/v1, serves openapi.json
    ├── lib/                        Shared helpers: prisma.ts, logger.ts, openapi.ts, app-error.ts
    ├── middleware/                 error-handler.ts, not-found.ts
    ├── modules/
    │   └── health/                 health.routes.ts  health.controller.ts  health.service.ts
    │                               health.schema.ts  health.test.ts
    └── generated/prisma/           Prisma client; gitignored, recreated by `prisma generate`
```

## Frontend tree (`frontend/`)

```text
frontend/
├── package.json  pnpm-lock.yaml  pnpm-workspace.yaml  tsconfig.json  next.config.ts
├── eslint.config.mjs  prettier.config.mjs  postcss.config.mjs
├── vitest.config.ts  vitest.setup.ts  components.json  .env.example  Dockerfile
└── src/
    ├── app/                        Thin route files only: layout.tsx, page.tsx, globals.css
    ├── features/
    │   └── health/                 health-status.tsx  health.slice.ts  health.api.ts
    │                               health.types.ts  and their *.test.ts(x) files
    ├── components/ui/              shadcn/ui output (generated; excluded from strict lint)
    ├── lib/
    │   ├── api/http.ts             The one axios instance and the ApiError type
    │   ├── api/schema.d.ts         Generated from the OpenAPI document, committed, never edited
    │   └── utils.ts                shadcn helper (cn)
    ├── store/                      index.ts (makeStore), hooks.ts (typed hooks), store-provider.tsx
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

Then mount the router in `backend/src/routes.ts` (`v1Router.use("/leads", leadsRouter)`), add the Prisma model and create a migration if the feature stores data, and run `pnpm --dir backend openapi:generate` so `backend/openapi/openapi.json` is updated and committed.

**Frontend**, in `frontend/src/features/leads/`:

1. Run `pnpm --dir frontend api:types` so `schema.d.ts` knows the new endpoints, and commit it.
2. `leads.types.ts`: types derived from the generated schema.
3. `leads.api.ts`: functions that call the shared `http` instance and return the unwrapped `data`.
4. `leads.slice.ts`: state, the `createAsyncThunk` thunks and the reducers.
5. One or more components, using only `useAppDispatch` and `useAppSelector`.
6. Tests for the slice and the components, mocking at `leads.api.ts`.

Then add the reducer to `makeStore` in `frontend/src/store/index.ts`, and add a route file under `frontend/src/app/` that only renders the feature component.

## Where configuration lives

- **Environment variables are per app** (D-25): `backend/.env.example` and `frontend/.env.example` are committed templates, and an optional, git-ignored `.env` next to each overrides them. Real `.env` files are never committed. Each app validates its variables with a Zod schema in `src/env.ts` at start-up, names the missing or invalid variable, and exits. Docker Compose reads the same files, then sets the few values that differ inside containers. Read configuration through `env` from `src/env.ts`, never `process.env` (lint-enforced, see [backend.md](backend.md#environment) and [frontend.md](frontend.md#environment)).
- **The Node.js major version** is pinned to the active LTS (D-04). It is written in [`.nvmrc`](../../.nvmrc), in `engines` in each `package.json`, and as the `NODE_VERSION` build argument of the `api` and `web` services in [`compose.yaml`](../../compose.yaml). Change all of them together; see [decision 0001](../decisions/0001-node-lts-pin.md).
- **The pnpm version** is the `packageManager` field of each `package.json`, activated through corepack.
- **Line endings** are LF everywhere, set in `.gitattributes`.
