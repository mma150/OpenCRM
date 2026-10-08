# 0004: The whole development stack runs in Docker Compose

## Status

Accepted. This is an owner decision (D-03), made on 2026-10-08 when planning Phase 1.

## Context

A new contributor should reach a working app with as little setup as possible. The recommended option was to run only PostgreSQL in Docker and run the API and web app on the host. The owner chose to run everything in containers, because first-run simplicity matters more to them than reload speed: the README's main path is a single command.

## Decision

`docker compose up` (see [`compose.yaml`](../../compose.yaml)) starts PostgreSQL, the API and the web app. Source folders are bind-mounted into the containers so edits reload without a rebuild. Each app has its own `node_modules` in a named volume, and the container installs dependencies from the frozen lockfile at every start (a no-op when current). Host ports are overridable with `DB_PORT`, `API_PORT` and `WEB_PORT`.

## Consequences

These were measured on the maintainer's Windows machine with Docker Desktop:

- **File watching needs polling.** Docker Desktop on Windows does not deliver file-change events through bind mounts. The API sets `CHOKIDAR_USEPOLLING=1` for `tsx watch`, and the web app sets `WATCHPACK_POLLING=true`. After a host edit the API restarts in about a second and the web page updates within roughly 8 to 12 seconds.
- **The web container runs Next.js in webpack mode** (`next dev --webpack`). Turbopack, the default, did not see edits made through the bind mount even with polling. Running `next dev` directly on the host can still use Turbopack.
- **The first start is slow.** From empty volumes, bringing up the database and API took about 84 to 113 seconds and the full stack about 179 to 187 seconds, mostly installing dependencies through the bind mount and compiling the first page. A warm restart of the API took about 15 seconds. The health checks allow for this with long start periods.
- **Host `node_modules` is only for editors, linters and hooks.** Native binaries installed on Windows cannot run in the Linux containers, which is why the containers keep their own volumes.
- **The pnpm store is kept inside the `node_modules` volume** so nothing large is written to the working tree.
- **The compose credentials are development-only.** They are labelled as such and PostgreSQL is published on `127.0.0.1` only.
- The check and build commands in [CONTRIBUTING.md](../../CONTRIBUTING.md) run on the host without Docker. The backend tests need a PostgreSQL reachable through `DATABASE_URL`; `docker compose up -d --wait db` provides one.
