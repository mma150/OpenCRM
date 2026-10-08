# OpenCRM

OpenCRM is an open source, self-hosted CRM for small sales teams (roughly 5-50 people). Sales people track their own leads, opportunities, follow-ups and customer conversations; admins and managers see exactly what the sales team is doing and when. It ships first as a responsive web app (Next.js frontend, Node/Express/Prisma backend), with a Flutter mobile app to follow.

## Quick start

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine with Docker Compose. Nothing else (no Node.js, no PostgreSQL) has to be installed to run the app.

From the repository root, start the whole stack (PostgreSQL, the API and the web app):

```sh
docker compose up
```

Then open:

- Web app: <http://localhost:3000>
- API health check: <http://localhost:4000/api/v1/health>

The home page shows the API status and the PostgreSQL server time; press **Refresh** to load them again.

Good to know:

- **The first start takes several minutes.** Each container installs its dependencies on start, and the web app compiles its first page. Later starts take well under a minute. Add `-d --wait` (`docker compose up -d --wait`) to run in the background and return once every service reports healthy.
- **If a port is already taken**, override it for every command. The variables are `DB_PORT` (default 5432), `API_PORT` (default 4000) and `WEB_PORT` (default 3000). For example, in a POSIX shell: `API_PORT=4010 WEB_PORT=3010 docker compose up`. The browser and the API follow these values automatically.
- **Source edits reload automatically.** The `frontend/` and `backend/` folders are mounted into the containers, so saving a file updates the running app without rebuilding.
- **Stop the stack** with `docker compose down`. Your data stays in a Docker volume.
- **Reset the database** (and the installed dependencies) with `docker compose down -v`.
- **The database credentials in `compose.yaml` are for local development only.** Never reuse them in any shared or production environment.

## Repository layout

- `frontend/` - the Next.js web app (App Router, Redux Toolkit).
- `backend/` - the Node/Express API with Prisma and PostgreSQL.
- `mobile/` - reserved for the Flutter mobile app, which follows the web app (not created yet).
