# Contributing to OpenCRM

Thank you for helping with OpenCRM. This guide is the short version of how to get set up, what the repository expects of a change, and how a change reaches `main`. Everything here is meant to be followed unchanged by every contributor, including the maintainers.

## Getting started

To run the app you only need Docker. Follow the [Quick start in the README](README.md#quick-start): one `docker compose up` starts PostgreSQL, the API and the web app, and source edits reload automatically.

To work on the code you will also want the toolchain on your own machine (editor type checking, running tests and lint outside Docker, commit tooling). The next section covers that.

## Setting up to commit

1. **Node.js 24.** The version is pinned in [`.nvmrc`](.nvmrc) (and in `engines` in each `package.json`). With nvm, nvm-windows or fnm, use the version in that file.
2. **pnpm through corepack.** Both apps use pnpm; the exact version is the `packageManager` field in each `package.json`. Enable it with:

   ```sh
   corepack enable
   ```

   Some Node installs do not ship the `corepack` command (Windows hosts in particular). If the command is missing, install it first with `npm install -g corepack`, then run `corepack enable` (on Windows this can need an elevated shell). If you prefer not to use corepack, `npm install -g pnpm@11.28.5` gives you the pinned version directly.
3. **Install dependencies at the repository root and in each app**, so the commit tooling, your editor and the linters all find their packages:

   ```sh
   pnpm install
   pnpm --dir backend install
   pnpm --dir frontend install
   ```

   The repository root is a tooling-only package (husky, lint-staged and commitlint, declared in the root `package.json`); it is not a workspace that contains the apps. `backend/` and `frontend/` are independent apps with their own `package.json` and lockfile. Installing on your host is only for tooling: the containers keep their own `node_modules`.

Never commit a real `.env` file. Each app has a committed `.env.example`; copy it to `.env` in the same folder only if you need to override a value locally.

## Standards

The written standards live in [`docs/standards/`](docs/standards/). Read the one that matches the area you are changing before you start; each one points at the working health feature as its example.

- [Folder structure and naming](docs/standards/structure.md)
- [Frontend: feature folders, slices and API calls](docs/standards/frontend.md)
- [Backend: modules, layering, envelopes and error codes](docs/standards/backend.md)
- [Commit messages](docs/standards/commits.md)
- [Testing](docs/standards/testing.md)
- [GitHub repository settings](docs/standards/github-settings.md)
- [Security practices](docs/standards/security.md)

Why the big choices were made is recorded in [`docs/decisions/`](docs/decisions/).

## Commit messages

Use one short line in the form `type: subject`, for example `feat: add lead list`. The type is one of `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `build` or `perf`; the subject is lowercase and the whole line is at most 72 characters. The full rules and how they are checked are in [docs/standards/commits.md](docs/standards/commits.md).

Commits and pull requests must never contain a `Co-Authored-By` line or any other AI attribution trailer. Keep messages short; the description of a change belongs in the pull request.

## Branches and pull requests

- `main` is the only long-lived branch. Work on a short-lived branch named `feat/...`, `fix/...` or `docs/...` followed by a short kebab-case description, for example `feat/lead-list`.
- Open a pull request into `main`. Pull requests are merged by **squash merge** only, so `main` gets exactly one commit per pull request, and that commit uses the pull request title.
- The **pull request title follows the commit format** (`type: subject`, lowercase, at most 72 characters). It is checked automatically.
- A pull request can merge only when all of these pass **and** it has **one approving review**:
  - lint, type-check, test and build for the frontend and for the backend (both apps are always checked, whichever one you changed);
  - the pull request title check;
  - CodeQL code scanning;
  - dependency review;
  - the secret scan;
  - the dependency vulnerability audit (a high or critical vulnerability blocks the merge; moderate and low are reported only).
- Lint is strict and warnings count as failures, so fix them rather than disabling a rule. Do not disable lint rules in tests either.

The matching GitHub settings, which the repository owner applies, are listed in [docs/standards/github-settings.md](docs/standards/github-settings.md).

## Running checks

Run these before you push. From the repository root:

| What | Backend | Frontend |
| --- | --- | --- |
| Lint, format check and type-check in one go | `pnpm --dir backend check` | `pnpm --dir frontend check` |
| Tests | `pnpm --dir backend test` | `pnpm --dir frontend test` |
| Production build | `pnpm --dir backend build` | `pnpm --dir frontend build` |
| Dependency audit | `pnpm --dir backend run audit` | `pnpm --dir frontend run audit` |

Things to know:

- Backend tests need PostgreSQL. Start it with `docker compose up -d --wait db`; the tests create and use their own `opencrm_test` database, never your development one. If you changed `DB_PORT`, export a matching `DATABASE_URL` in your shell first. See [docs/standards/testing.md](docs/standards/testing.md).
- The frontend build needs `NEXT_PUBLIC_API_URL` set (the build fails and names the variable if it is missing or not a URL) and needs network access, because the page font is fetched at build time. For example: `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1 pnpm --dir frontend build`.
- If you change a backend route or schema, regenerate the API contract and the frontend types and commit both results: `pnpm --dir backend openapi:generate`, then `pnpm --dir frontend api:types`. A test fails until the committed `backend/openapi/openapi.json` matches the code.

## Security

Never open a public issue for a security vulnerability. Follow [SECURITY.md](SECURITY.md) to report it privately. Never commit secrets; the development credentials in `compose.yaml` and the `.env.example` files are for local development only.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By taking part you agree to uphold it.

## Licence

OpenCRM is licensed under the [Apache License 2.0](LICENSE). By submitting a contribution you agree that it is licensed under the same terms.
