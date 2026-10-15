# OpenCRM

OpenCRM is an open source, self-hosted CRM for small sales teams of roughly 5 to 50 people. Sales people log their leads, contacts, companies and opportunities, every conversation they have about them, and what happens next. Admins and sales managers can open any record they are responsible for and read a dated history of what was discussed and when, and see what each person on the team has been doing. It is a responsive web app (Next.js) on top of a documented REST API (Node.js, Express, Prisma and PostgreSQL), with a Flutter mobile app for Android that uses the same API. You run it on your own server; one installation holds one organisation.

**Status.** The first version of the web app and the API is complete. The mobile app covers most of the daily sales work, has been tested on Android only, and is not in any app store yet. There is no tagged release, and no production deployment setup in the repository yet (see [Running in production](#running-in-production)).

## Features

A short summary. The full list, with what each role can do, is in [FEATURES.md](FEATURES.md).

- **Leads**: create, assign, follow up, mark as lost, and convert into a contact, company and opportunity while keeping their history.
- **Conversations and timeline**: log calls, meetings, emails and messages, and add notes. Every record has one dated, permanent timeline of who did what and when.
- **Contacts and companies**, linked to each other.
- **Opportunities**: a pipeline board and a list, close as won or lost, and stages an Admin configures.
- **Tasks and reminders**: tasks grouped by overdue, today and upcoming; follow-up reminders on leads and opportunities, delivered in the app and by email.
- **Dashboards**: each user's own figures, and per-person team figures and an activity feed for Admins, Sales Managers and Read-only users.
- **Custom fields** (text, number, date, dropdown) on leads, contacts, companies and opportunities, with list filters.
- **CSV import** of leads, contacts and companies with column mapping and a report of failed rows; **CSV export** of every list.
- **Email** from a record over your own SMTP server, with reusable templates; sent emails appear on the timeline.
- **Products, quotes and invoices**: a product catalog, quotes with line items, discounts and tax, PDF download and emailing, and invoices made from accepted quotes.
- **Roles and permissions**: Admin, Sales Manager, Sales Rep and Read-only. A Sales Rep sees only their own records, a Sales Manager their own and their team's, an Admin everything; a Read-only user sees everything and changes nothing. The API enforces every rule.
- **Mobile app** for Android: leads, contacts, companies, opportunities, timelines, tasks, notifications and quotes. Converting leads, invoices, import and export, and all settings stay in the web app.
- **Responsive**: every web screen works on a phone, a tablet and a desktop, in light and dark themes.

Known limits, in short: one currency (US dollars) and US English formats; the PDF files can only print Western European alphabets (other characters print as `?`); the mobile app shows notifications only while it is open (no push notifications); the iOS app has not been built or tested. The full lists of [known limits](FEATURES.md#known-limits) and of what is [not available yet](FEATURES.md#not-yet-available) are in FEATURES.md.

## Quick start

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/), or Docker Engine with Docker Compose. Nothing else (no Node.js, no PostgreSQL) has to be installed to run the app.

```sh
git clone https://github.com/mma150/OpenCRM.git
cd OpenCRM
docker compose up
```

This starts four services: PostgreSQL, a local mail inbox (Mailpit), the API and the web app. Then open:

| What | Address |
| --- | --- |
| Web app | <http://localhost:3000> |
| API health check | <http://localhost:4000/api/v1/health> |
| API contract (OpenAPI) | <http://localhost:4000/api/v1/openapi.json> |
| Mail inbox (Mailpit) | <http://localhost:8025> |

**The first visit asks you to create the Admin account.** After that the web app opens on the sign-in page, and the Admin can invite the rest of the team under Settings > Users. The page at <http://localhost:3000/status> needs no sign-in and shows whether the API and the database are reachable.

Good to know:

- **The first start takes several minutes.** Each container installs its dependencies when it starts, and the web app compiles its first page. Later starts take well under a minute. `docker compose up -d --wait` runs the stack in the background and returns once every service reports healthy.
- **Emails stay on your machine.** Invites, password-reset links, reminders and the emails users send are caught by [Mailpit](https://mailpit.axllent.org/) and shown in the mail inbox above. Nothing is delivered to a real address.
- **Source edits reload automatically.** The `frontend/` and `backend/` folders are mounted into the containers, so saving a file updates the running app without a rebuild.
- **Stop the stack** with `docker compose down`. Your data stays in a Docker volume. **Reset everything** (the database and the installed dependencies) with `docker compose down -v`.
- **The credentials and the encryption key in `compose.yaml` are for local development only.** Never reuse them anywhere else.

### If a port is already taken

The host ports can be changed with four variables. Set them for every `docker compose` command, not only the first one:

| Variable | Default | Service |
| --- | --- | --- |
| `DB_PORT` | 5432 | PostgreSQL (published on 127.0.0.1 only) |
| `API_PORT` | 4000 | The API |
| `WEB_PORT` | 3000 | The web app |
| `MAIL_UI_PORT` | 8025 | The Mailpit inbox (published on 127.0.0.1 only) |

```sh
# POSIX shell (Linux, macOS, Git Bash)
API_PORT=4010 WEB_PORT=3010 docker compose up
```

```powershell
# PowerShell
$env:API_PORT = "4010"; $env:WEB_PORT = "3010"; docker compose up
```

The web app, the API's allowed origin and the links in emails follow these values automatically.

## Configuration

Each app reads its settings from environment variables, checks them when it starts, and stops with the name of any variable that is missing or wrong. The committed templates list every variable with a comment saying what it does:

- [`backend/.env.example`](backend/.env.example) for the API
- [`frontend/.env.example`](frontend/.env.example) for the web app

To change a value for local development, copy the template to `.env` in the same folder and edit the copy. Never commit a `.env` file. Inside Docker Compose, `compose.yaml` sets the few values that differ in containers (the database host, the allowed origin, the mail server and a development encryption key).

The important ones:

| Variable | App | What it does |
| --- | --- | --- |
| `DATABASE_URL` | API | The PostgreSQL connection string. Required. |
| `APP_URL` | API | The public address of the web app. Invite and password-reset links are built from it. |
| `CORS_ORIGINS` | API | The web app's origin (a comma-separated list). Browsers from other origins are refused. |
| `SESSION_COOKIE_SECURE` | API | Send the session cookie over HTTPS only. Defaults to true when `NODE_ENV=production`. |
| `TRUST_PROXY` | API | The number of reverse proxies in front of the API, so that rate limits see the visitor's address. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | API | The outgoing mail server. Leave `SMTP_HOST` empty to switch email off; an Admin is then shown invite and reset links to pass on by hand. |
| `SETTINGS_ENCRYPTION_KEY` | API | At least 32 characters. Encrypts the SMTP password an Admin saves in the app (Settings > Email). Generate one with `openssl rand -base64 48`, keep it secret, and keep it the same: if it changes, the saved password has to be entered again. Without it, a password cannot be saved in the app. |
| `NEXT_PUBLIC_API_URL` | Web | The address the browser uses to reach the API, ending in `/api/v1`. It is built into the web app, so it must be set when the web app is built. Never put a secret in the web app's environment. |

**Email can be set up in two ways**: with the `SMTP_*` variables, or by an Admin in the web app under Settings > Email. Settings saved in the app win over the variables.

## Running in production

The repository does **not** include a production setup yet. `compose.yaml` and both Dockerfiles are for local development only (they run the development servers from mounted source), and there is no deployment guide. If you run OpenCRM for real today, you assemble the deployment yourself from these pieces:

- **The API** (in `backend/`): `pnpm install --frozen-lockfile`, `pnpm build` (writes `dist/`), `pnpm exec prisma migrate deploy` to create or update the database tables, then `pnpm start` with `NODE_ENV=production`. It needs Node.js 24 and PostgreSQL 18 (the version the project develops and tests with). The reminder check runs inside the API process.
- **The web app** (in `frontend/`): `pnpm install --frozen-lockfile`, then `pnpm build` with `NEXT_PUBLIC_API_URL` set to the API's public address, then `pnpm start` with the same `NEXT_PUBLIC_API_URL` set (the web app checks it when it starts as well).

What an operator must take care of:

- **HTTPS** in front of both the web app and the API. The session cookie is `SameSite=Lax`, so the web app and the API must be on the same site (the same host, or two hosts under one domain such as `crm.example.com` and `api.example.com`). The mobile app's release builds only connect over `https://`.
- **Your own secrets**: a strong PostgreSQL password, your own `SETTINGS_ENCRYPTION_KEY`, and never the development values from `compose.yaml` or the `.env.example` files.
- **The right addresses**: `APP_URL` and `CORS_ORIGINS` set to the web app's public address, and `TRUST_PROXY` set to the number of proxies in front of the API.
- **A real mail server**, through the `SMTP_*` variables or Settings > Email, so that invites, password resets and reminders reach people.
- **Backups** of the PostgreSQL database, made and tested by you; OpenCRM has no backup feature. Keep `SETTINGS_ENCRYPTION_KEY` somewhere safe too, separately from the database backups.
- **Upgrades**: pull the new code, build both apps again, and run `prisma migrate deploy` before starting the new API.

A supported production setup would be a welcome contribution; see [COLLABORATION.md](COLLABORATION.md).

## Repository layout

```text
OpenCRM/
├── backend/      The API: Node.js, Express, Prisma and PostgreSQL  (backend/README.md)
├── frontend/     The web app: Next.js, Redux Toolkit, Tailwind CSS  (frontend/README.md)
├── mobile/       The Flutter app for Android (iOS not built yet)    (mobile/README.md)
├── docs/
│   ├── standards/   How the code is written, one document per area
│   ├── decisions/   One-page records of the big decisions
│   └── design/      Design mock-ups made before the screens were built (not screenshots)
├── scripts/      Repository checks and commit-hook helpers
├── .github/      CI workflows, Dependabot, issue and pull request templates
└── compose.yaml  The local development stack: db, mailpit, api, web
```

The three apps are independent: each has its own dependencies and lockfile, and they share only the API contract, [`backend/openapi/openapi.json`](backend/openapi/openapi.json). A feature has the same folder name in all three (`backend/src/modules/leads/`, `frontend/src/features/leads/`, `mobile/lib/features/leads/`), so you can find every part of it from the name.

## Documentation

For people who use or run OpenCRM:

- [FEATURES.md](FEATURES.md): everything OpenCRM does, by role, with its known limits
- [SECURITY.md](SECURITY.md): how to report a vulnerability

For contributors:

- [COLLABORATION.md](COLLABORATION.md): how to take part, from a first issue to a merged pull request
- [CONTRIBUTING.md](CONTRIBUTING.md): how to set up, make a change, and pass the checks
- [backend/README.md](backend/README.md), [frontend/README.md](frontend/README.md) and [mobile/README.md](mobile/README.md): working in each app
- [Code of conduct](CODE_OF_CONDUCT.md)

Standards every change follows:

- [Folder structure and naming](docs/standards/structure.md)
- [Backend: modules, layering, envelopes and error codes](docs/standards/backend.md)
- [Frontend: feature folders, slices and API calls](docs/standards/frontend.md)
- [Mobile: features, the API client, state and shared widgets](docs/standards/mobile.md)
- [Testing](docs/standards/testing.md)
- [Commit messages](docs/standards/commits.md)
- [Security practices](docs/standards/security.md)
- [GitHub repository settings](docs/standards/github-settings.md)

Why the big choices were made, in the [decision records](docs/decisions/): [the Node.js version](docs/decisions/0001-node-lts-pin.md), [the root tooling package](docs/decisions/0002-root-tooling-package.md), [async thunks with axios](docs/decisions/0003-async-thunks-with-axios.md), [development in Docker](docs/decisions/0004-all-in-docker-development.md) and [the mobile app's stack](docs/decisions/0005-mobile-app-stack.md).

## Development

Run these from the repository root. The apps are independent, so each has its own commands. The host commands need Node.js 24 and pnpm 11; the setup is in [CONTRIBUTING.md](CONTRIBUTING.md#setting-up-to-commit).

| What | Backend | Frontend |
| --- | --- | --- |
| Lint, format check and type-check | `pnpm --dir backend check` | `pnpm --dir frontend check` |
| Tests | `pnpm --dir backend test` | `pnpm --dir frontend test` |
| Production build | `pnpm --dir backend build` | `pnpm --dir frontend build` |
| Dependency audit | `pnpm --dir backend run audit` | `pnpm --dir frontend run audit` |

The mobile app's checks run inside `mobile/` with the Flutter SDK: `flutter pub get --enforce-lockfile`, `dart format --output=none --set-exit-if-changed .`, `flutter analyze --fatal-infos` and `flutter test`.

Notes:

- Backend tests need PostgreSQL and use their own `opencrm_test` database: start it with `docker compose up -d --wait db` first. If you changed `DB_PORT`, set a matching `DATABASE_URL` in your shell.
- The frontend build needs `NEXT_PUBLIC_API_URL` (for example `http://localhost:4000/api/v1`) and network access, because the page font is fetched at build time.
- After changing a backend route or schema, run `pnpm --dir backend openapi:generate` and then `pnpm --dir frontend api:types`, and commit both generated files.
- `node scripts/verify-foundation.mjs` (or `pnpm verify:foundation`) checks that the repository's standards, workflows and documents are consistent with each other.

More detail for each app is in [backend/README.md](backend/README.md), [frontend/README.md](frontend/README.md) and [mobile/README.md](mobile/README.md).

## Contributing

Contributions are welcome: bug reports, feature requests, documentation, testing and code. Start with [COLLABORATION.md](COLLABORATION.md) for how to take part and how decisions are made, and [CONTRIBUTING.md](CONTRIBUTING.md) for how to make a change that passes review. Everyone who takes part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Security

Do not report a vulnerability in a public issue. Use GitHub's private vulnerability reporting, as described in [SECURITY.md](SECURITY.md).

## Licence

OpenCRM is released under the [Apache License 2.0](LICENSE). Copyright 2026 The OpenCRM contributors; see [NOTICE](NOTICE). Third-party packages used by OpenCRM are under their own licences.
