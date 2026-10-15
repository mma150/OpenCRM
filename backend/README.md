# OpenCRM API

The backend of OpenCRM: a versioned REST API that the web app and the mobile app both use. It holds every business rule, including who may see and change what, and it is the only part of OpenCRM that talks to the database.

How the code is written is in the [backend standard](../docs/standards/backend.md); read it before you change anything here. This page is the short version for getting started.

## Stack

Versions are exact and come from [`package.json`](package.json); every change to them needs the owner's approval ([dependency rules](../docs/standards/security.md#dependency-rules)).

| Part                    | Package and version                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| Runtime                 | Node.js 24 (pinned in [`.nvmrc`](../.nvmrc)), pnpm 11.28.5, ES modules, TypeScript 6.0.3             |
| HTTP                    | Express 5.2.1, helmet 8.3.0, cors 2.8.6, cookie-parser 1.4.7, express-rate-limit 8.7.0               |
| Database                | PostgreSQL 18, Prisma 7.10.0 with the `pg` driver adapter (`@prisma/adapter-pg` 7.10.0, `pg` 8.23.1) |
| Validation and contract | Zod 4.6.5, `@asteasolutions/zod-to-openapi` 9.1.0 (OpenAPI 3.1)                                      |
| Passwords               | `@node-rs/argon2` 2.2.0 (Argon2id)                                                                   |
| Email and PDF           | nodemailer 10.0.14, pdfkit 0.20.2                                                                    |
| Logging                 | pino 10.4.0, pino-http 11.0.0 (pino-pretty 13.2.0 in development)                                    |
| Build and dev server    | tsup 8.5.1, tsx 4.23.15                                                                              |
| Tests                   | Vitest 5.0.3, supertest 7.3.1, against a real PostgreSQL database                                    |
| Lint and format         | ESLint 10.12.0 with typescript-eslint 8.71.1, Prettier 3.9.9                                         |

## Run it

The easiest way is the whole stack in Docker, from the repository root ([Quick start](../README.md#quick-start)):

```sh
docker compose up
```

The `api` container installs the dependencies, runs `prisma generate` and `prisma migrate deploy`, then starts `tsx watch` on port 4000, so a saved file restarts the API. Check it at <http://localhost:4000/api/v1/health>. Commands that need the database are easiest inside the container, where the database host and credentials are already set:

```sh
docker compose exec api pnpm run check
docker compose exec api pnpm exec prisma validate
docker compose exec api pnpm exec prisma migrate status
```

On your own machine (Node.js 24 and pnpm 11, see [CONTRIBUTING.md](../CONTRIBUTING.md#setting-up-to-commit)), run the scripts from the repository root with `pnpm --dir backend <script>`, or from this folder with `pnpm <script>`:

| Script                                        | What it does                                                                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `check`                                       | `lint`, `format:check` and `typecheck` in one go. Warnings count as failures.                                                |
| `test`                                        | Vitest, against the `opencrm_test` database (see [Tests](#tests)).                                                           |
| `build`                                       | tsup bundles `src/server.ts` into `dist/`.                                                                                   |
| `start`                                       | Runs `dist/server.js`.                                                                                                       |
| `dev`                                         | `tsx watch src/server.ts`, the development server (what the container runs).                                                 |
| `openapi:generate`                            | Writes [`openapi/openapi.json`](openapi/openapi.json) from the code.                                                         |
| `db:generate`                                 | `prisma generate`: the Prisma client, into `src/generated/prisma/` (not committed). Also runs after every install.           |
| `db:migrate`                                  | `prisma migrate deploy`: applies the committed migrations.                                                                   |
| `audit`                                       | `pnpm audit --audit-level=high`. Run it as `pnpm --dir backend run audit`, because `pnpm audit` alone is pnpm's own command. |
| `format`, `lint`, `format:check`, `typecheck` | The parts of `check` on their own; `format` rewrites files.                                                                  |

### The database and migrations

The schema is [`prisma/schema.prisma`](prisma/schema.prisma) and the migrations are in [`prisma/migrations/`](prisma/migrations/). To change the schema, edit it and then, with the stack running:

```sh
docker compose exec api pnpm exec prisma migrate dev --name <short-description>
docker compose exec api pnpm exec prisma generate
```

Commit the new migration folder with the schema change. Never edit a migration that has been merged. The container applies committed migrations every time it starts.

## Environment

[`src/env.ts`](src/env.ts) is the only file that reads `process.env`. It validates every variable with Zod when the API starts, prints each bad one by name and exits before the server listens. [`.env.example`](.env.example) lists them all with what each does:

| Variable                                                                                 | Default                 | Notes                                                                        |
| ---------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| `NODE_ENV`                                                                               | `development`           | `development`, `test` or `production`                                        |
| `PORT`                                                                                   | `4000`                  |                                                                              |
| `DATABASE_URL`                                                                           | none (required)         | A `postgresql://` URL                                                        |
| `CORS_ORIGINS`                                                                           | `http://localhost:3000` | Comma-separated origins of the web app                                       |
| `APP_URL`                                                                                | `http://localhost:3000` | The web app's public address, for links in emails                            |
| `TRUST_PROXY`                                                                            | `0`                     | The number of reverse proxies in front of the API                            |
| `SESSION_COOKIE_SECURE`                                                                  | true in production      | HTTPS-only session cookie                                                    |
| `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | email off               | `MAIL_FROM` is required when `SMTP_HOST` is set                              |
| `SETTINGS_ENCRYPTION_KEY`                                                                | none                    | At least 32 characters; encrypts the SMTP password an Admin saves in the app |

Copy `.env.example` to `.env` in this folder to override a value on your machine; `.env` is never committed. Inside Docker Compose, [`compose.yaml`](../compose.yaml) sets the database host, the origin, the mail server (Mailpit) and a development-only encryption key. Adding a variable means adding it to the Zod schema, to `.env.example`, and to `compose.yaml` if the container needs another value; `pnpm verify:foundation` checks that the schema and `.env.example` agree.

## Folder layout

```text
backend/
├── src/
│   ├── server.ts        Starts the HTTP listener and the reminder loop
│   ├── app.ts           createApp(): the middleware in order, and the /api/v1 router
│   ├── routes.ts        Mounts every module's router under /api/v1
│   ├── env.ts           The only reader of process.env
│   ├── modules/<name>/  One folder per module (below)
│   ├── lib/             Shared code: prisma, logger, openapi, app-error, record-access, timeline,
│   │                    mailer, reminders, custom-fields, csv, sales documents and PDF, ...
│   ├── middleware/      authenticate, require-role, origin-check, rate-limit, error-handler, not-found
│   └── generated/       The Prisma client (generated, not committed)
├── prisma/              schema.prisma and migrations/
├── openapi/openapi.json The API contract, generated and committed
├── scripts/             generate-openapi.ts
└── test/                global-setup.ts (the test database) and helpers.ts
```

A request goes **route → controller → service → Prisma**. Each module folder has exactly five files:

| File                     | Role                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `<module>.routes.ts`     | The Express router, and the OpenAPI description of each path beside it                   |
| `<module>.controller.ts` | Reads the request, validates it with Zod, calls the service, sends the envelope          |
| `<module>.service.ts`    | The business rules and the Prisma calls. It takes plain arguments and returns plain data |
| `<module>.schema.ts`     | Zod schemas for input and output                                                         |
| `<module>.test.ts`       | supertest tests against the real test database                                           |

The modules today: `auth`, `users`, `leads`, `contacts`, `companies`, `opportunities`, `pipeline-stages`, `timeline`, `activity`, `tasks`, `notifications`, `dashboard`, `custom-fields`, `imports`, `email-settings`, `email-templates`, `emails`, `organization`, `products`, `quotes`, `invoices` and `health`. The [health module](src/modules/health/) is the smallest complete example. ESLint enforces the layering: a router never imports a service, a controller never imports Prisma, and nothing outside `src/env.ts` (and two configuration files) reads `process.env`. The [import rules](../docs/standards/backend.md#import-rules) list the few shared helpers in `src/lib/` that may call Prisma too.

## The API contract

- **One versioned base path**: everything is under `/api/v1`.
- **OpenAPI 3.1**, generated from the same Zod schemas the API validates with, so the documentation cannot drift from the code. It is served at `GET /api/v1/openapi.json` and committed as [`openapi/openapi.json`](openapi/openapi.json). After changing a route or a schema, run `pnpm --dir backend openapi:generate` and commit the file; a test fails while it is out of date, and CI checks it too. The web app's types are generated from this file ([frontend/README.md](../frontend/README.md#api-types)).
- **One envelope.** Success is `{ "data": ..., "meta": {...} }`; a list puts `{ page, pageSize, total }` in `meta`. An error is `{ "error": { "code", "message", "details" } }`. Clients switch on `code`, never on the HTTP status or the message. The only responses without an envelope are the OpenAPI document, CSV exports and PDF files.
- **Error codes** are one list, `ERROR_CODES` in [`src/lib/app-error.ts`](src/lib/app-error.ts), documented in the [error code table](../docs/standards/backend.md#error-codes-d-12) (for example `VALIDATION_FAILED`, `NOT_FOUND`, `UNAUTHENTICATED`, `FORBIDDEN`, `RATE_LIMITED`). Adding a code is safe; renaming or removing one breaks the clients.
- **Signing in**: the web app signs in with `POST /auth/login` and gets an httpOnly session cookie. A client without cookies, such as the mobile app, signs in with `POST /auth/token` and sends the token as `Authorization: Bearer <token>`. Both are the same server-side session. A request that changes something and carries the cookie must come from an origin in `CORS_ORIGINS`.
- **Roles**: Admin, Sales Manager, Sales Rep and Read-only. `requireRole` decides who may use a route at all; whether a user may see or change one particular record is decided in the service by the rules in [`src/lib/record-access.ts`](src/lib/record-access.ts). A record outside the caller's reach is `NOT_FOUND`, never `FORBIDDEN`. See [Record access](../docs/standards/backend.md#record-access).
- **Lists** share one query string (`search`, `sort`, `order`, `page`, `pageSize` up to 100, and filters) defined in [`src/lib/list-query.ts`](src/lib/list-query.ts).
- **Every response has an `X-Request-Id` header**, and the same id is on the request's log line.

## Tests

Tests run against a real PostgreSQL server, never a mock of Prisma. They use their own database, `opencrm_test`, which [`test/global-setup.ts`](test/global-setup.ts) creates and migrates before the run, so your development data is never touched.

```sh
docker compose up -d --wait db     # PostgreSQL only
pnpm --dir backend test
```

The setup finds the server through `DATABASE_URL` in your shell, or else `.env`, or else `.env.example` (localhost:5432). If you changed `DB_PORT`, set `DATABASE_URL` in your shell to match, for example `postgresql://opencrm:opencrm@localhost:5440/opencrm`. Test files run one at a time. Email is off in tests; [`test/helpers.ts`](test/helpers.ts) has the helpers to sign in as each role and to capture email. What every module must test is in the [testing standard](../docs/standards/testing.md#backend-tests).

## Adding a module

Copy the health module and rename it; do not invent a new shape. The steps (schema, service, controller, routes, tests, mounting the router in `routes.ts`, a Prisma migration, regenerating the OpenAPI document and the web types) are in [Adding a feature](../docs/standards/structure.md#adding-a-feature). A module of owned records also follows [Record access](../docs/standards/backend.md#record-access), [List endpoints](../docs/standards/backend.md#list-endpoints) and, if it has a history, [The timeline](../docs/standards/backend.md#the-timeline).

## Related

- [Backend standard](../docs/standards/backend.md), [testing standard](../docs/standards/testing.md), [security practices](../docs/standards/security.md)
- [Folder structure and naming](../docs/standards/structure.md)
- [Web app](../frontend/README.md) and [mobile app](../mobile/README.md), the two clients of this API
- [CONTRIBUTING.md](../CONTRIBUTING.md)
