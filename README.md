# OpenCRM

OpenCRM is an open source, self-hosted CRM for small sales teams (roughly 5-50 people). Sales people track their own leads, opportunities, follow-ups and customer conversations; admins and managers see exactly what the sales team is doing and when. It ships first as a responsive web app (Next.js frontend, Node/Express/Prisma backend), with a Flutter mobile app to follow.

## Quick start

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine with Docker Compose. Nothing else (no Node.js, no PostgreSQL) has to be installed to run the app.

From the repository root, start the whole stack (PostgreSQL, a local mail inbox, the API and the web app):

```sh
docker compose up
```

Then open:

- Web app: <http://localhost:3000>
- API health check: <http://localhost:4000/api/v1/health>
- Mail inbox (Mailpit): <http://localhost:8025>

The first visit asks you to create the Admin account; after that the web app opens on the sign-in page. The page at <http://localhost:3000/status> needs no sign-in and shows the API status and the PostgreSQL server time; press **Refresh** to load them again.

Good to know:

- **The first start takes several minutes.** Each container installs its dependencies on start, and the web app compiles its first page. Later starts take well under a minute. Add `-d --wait` (`docker compose up -d --wait`) to run in the background and return once every service reports healthy.
- **If a port is already taken**, override it for every command. The variables are `DB_PORT` (default 5432), `API_PORT` (default 4000), `WEB_PORT` (default 3000) and `MAIL_UI_PORT` (default 8025). For example, in a POSIX shell: `API_PORT=4010 WEB_PORT=3010 docker compose up`. The browser and the API follow these values automatically.
- **Emails stay on your machine.** Invite and password-reset emails are caught by [Mailpit](https://mailpit.axllent.org/) and shown in the mail inbox above; nothing is delivered to a real address. To use a real mail server, or to switch email off, set the `SMTP_*` variables described in `backend/.env.example`. With email off, an Admin is shown a link to pass on instead. An Admin can also set the mail server in the app (Settings > Email); its password is stored encrypted with the key in `SETTINGS_ENCRYPTION_KEY`, which every real installation must set to its own secret of at least 32 characters (see `backend/.env.example`). The key in `compose.yaml` is for local development only.
- **Source edits reload automatically.** The `frontend/` and `backend/` folders are mounted into the containers, so saving a file updates the running app without rebuilding.
- **Stop the stack** with `docker compose down`. Your data stays in a Docker volume.
- **Reset the database** (and the installed dependencies) with `docker compose down -v`.
- **The database credentials in `compose.yaml` are for local development only.** Never reuse them in any shared or production environment.

## Repository layout

- `frontend/` - the Next.js web app (App Router, Redux Toolkit).
- `backend/` - the Node/Express API with Prisma and PostgreSQL.
- `mobile/` - reserved for the Flutter mobile app, which follows the web app (a README only, no code yet).
- `docs/` - the written standards (`docs/standards/`) and one-page decision records (`docs/decisions/`).

## Documentation

Start with [CONTRIBUTING.md](CONTRIBUTING.md); it explains how to set up, how commits, branches and pull requests work, and how to run the checks.

Standards every change follows (each points at the working health feature as its example):

- [Folder structure and naming](docs/standards/structure.md)
- [Frontend: feature folders, slices and API calls](docs/standards/frontend.md)
- [Backend: modules, layering, envelopes and error codes](docs/standards/backend.md)
- [Commit messages](docs/standards/commits.md)
- [Testing](docs/standards/testing.md)
- [GitHub repository settings](docs/standards/github-settings.md)
- [Security practices](docs/standards/security.md)

Why the big choices were made: [decision records](docs/decisions/) ([Node version](docs/decisions/0001-node-lts-pin.md), [root tooling package](docs/decisions/0002-root-tooling-package.md), [async thunks with axios](docs/decisions/0003-async-thunks-with-axios.md), [development in Docker](docs/decisions/0004-all-in-docker-development.md)).

Project policies: [Code of conduct](CODE_OF_CONDUCT.md), [Security policy](SECURITY.md) and the [Apache-2.0 licence](LICENSE).

## Development

Run these from the repository root. The apps are independent, so each has its own commands.

| What | Backend | Frontend |
| --- | --- | --- |
| Lint, format check and type-check | `pnpm --dir backend check` | `pnpm --dir frontend check` |
| Tests | `pnpm --dir backend test` | `pnpm --dir frontend test` |
| Production build | `pnpm --dir backend build` | `pnpm --dir frontend build` |

Notes:

- Backend tests need PostgreSQL and use their own `opencrm_test` database: start the database with `docker compose up -d --wait db` first.
- The frontend build needs `NEXT_PUBLIC_API_URL` set (for example `http://localhost:4000/api/v1`) and network access, because the page font is fetched at build time.
- After changing a backend route or schema, run `pnpm --dir backend openapi:generate` and then `pnpm --dir frontend api:types`, and commit both generated files.

To commit, set up Node.js 24 (see `.nvmrc`), pnpm through corepack, and run `pnpm install` at the repository root and in each app. The steps, including a fallback for hosts without the `corepack` command, are in [CONTRIBUTING.md](CONTRIBUTING.md#setting-up-to-commit). Commit messages follow the [commit standard](docs/standards/commits.md).

## Licence

OpenCRM is released under the [Apache License 2.0](LICENSE).
