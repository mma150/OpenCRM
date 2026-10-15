# Contributing to OpenCRM

Thank you for helping with OpenCRM. This guide is the technical side of a contribution: how to get set up, what the repository expects of a change, and how a change reaches `main`. Everything here applies to every contributor, the maintainers included.

How to take part more generally (where to ask, how to report a bug or propose a feature, how decisions are made, what to work on first) is in [COLLABORATION.md](COLLABORATION.md). Read that first if this is your first contribution.

## Getting started

OpenCRM is three independent apps in one repository:

- [`backend/`](backend/README.md): the API (Node.js, Express, Prisma, PostgreSQL)
- [`frontend/`](frontend/README.md): the web app (Next.js, Redux Toolkit)
- [`mobile/`](mobile/README.md): the Flutter app for Android

To run the API and the web app you only need Docker. Follow the [Quick start in the README](README.md#quick-start): one `docker compose up` starts PostgreSQL, a local mail inbox, the API and the web app, and source edits reload automatically. Each app's README explains how to work in that folder.

To work on the code you will also want the toolchain on your own machine, for type checking in your editor, running the tests and lint outside Docker, and the commit hooks. The next section covers that. To work on the mobile app you also need the Flutter SDK ([mobile/README.md](mobile/README.md#requirements)).

## Setting up to commit

1. **Node.js 24.** The version is pinned in [`.nvmrc`](.nvmrc) and in `engines` in each `package.json`. With nvm, nvm-windows or fnm, use the version in that file.
2. **pnpm 11 through corepack.** All three `package.json` files pin the same version in their `packageManager` field (pnpm 11.28.5). Enable it with:

   ```sh
   corepack enable
   ```

   Some Node installs do not ship the `corepack` command (Windows hosts in particular). If the command is missing, install it first with `npm install -g corepack`, then run `corepack enable` (on Windows this can need an elevated shell). If you prefer not to use corepack, `npm install -g pnpm@11.28.5` gives you the pinned version directly.

   An older pnpm 10 installed globally stops inside `backend/` and `frontend/` with `ERROR  packages field missing or empty` (each app's `pnpm-workspace.yaml` holds settings only), even when `pnpm --version` at the repository root prints 11.28.5. Run `pnpm --version` inside `backend/`: it must print 11.28.5. If it does not, install pnpm 11 as above.

3. **Install dependencies at the repository root and in each app**, so the commit tooling, your editor and the linters all find their packages:

   ```sh
   pnpm install
   pnpm --dir backend install
   pnpm --dir frontend install
   ```

   The repository root is a tooling-only package (husky, lint-staged and commitlint, declared in the root `package.json`); it is not a workspace that contains the apps. `backend/` and `frontend/` are independent apps with their own `package.json` and lockfile. Installing on your host is only for tooling: the containers keep their own `node_modules`.

4. **For the mobile app**, Flutter 3.47.6 and `flutter pub get --enforce-lockfile` inside `mobile/`.

Installing at the root sets up two git hooks: `commit-msg` checks your commit message, and `pre-commit` formats the staged backend and frontend files and scans them for secrets. The secret scan needs either a `gitleaks` binary on your PATH or Docker running. Details are in [Local hooks](docs/standards/commits.md#local-hooks).

Never commit a real `.env` file. Each app has a committed `.env.example`; copy it to `.env` in the same folder only if you need to override a value locally.

## Standards

The written standards live in [`docs/standards/`](docs/standards/). Read the one that matches the area you are changing before you start; each one points at a working feature as its example (the health feature for the API and the web app, the leads feature for the mobile app).

- [Folder structure and naming](docs/standards/structure.md)
- [Backend: modules, layering, envelopes and error codes](docs/standards/backend.md)
- [Frontend: feature folders, slices and API calls](docs/standards/frontend.md)
- [Mobile: features, the API client, state and shared widgets](docs/standards/mobile.md)
- [Testing](docs/standards/testing.md)
- [Commit messages](docs/standards/commits.md)
- [Security practices](docs/standards/security.md)
- [GitHub repository settings](docs/standards/github-settings.md)

Why the big choices were made is recorded in [`docs/decisions/`](docs/decisions/). A few rules that surprise people:

- **Dependencies need the owner's approval.** Adding, removing or changing a package or a version, in any of the three apps, is agreed with the owner first ([dependency rules](docs/standards/security.md#dependency-rules)). Versions are exact and lockfiles are committed.
- **The API contract is generated.** If you change a backend route or schema, regenerate `backend/openapi/openapi.json` and the web app's types and commit both (see [Running checks](#running-checks)).
- **Access rules live in the API.** Hiding a button in the web or mobile app is never the protection; the API service checks the role and the record.
- **Every web screen must work at phone, tablet and desktop widths** with no horizontal page scroll, in light and dark ([responsive rules](docs/standards/frontend.md#responsive-rules)).

## Commit messages

Use one short line in the form `type: subject`, for example `feat: add lead list`. The type is one of `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `build` or `perf`; the subject starts with a lowercase letter and the whole line is at most 72 characters. The full rules and how they are checked are in [docs/standards/commits.md](docs/standards/commits.md).

Commits and pull requests must never contain a `Co-Authored-By` line or any other AI attribution trailer. Keep messages short; the description of a change belongs in the pull request.

## Branches and pull requests

- `main` is the only long-lived branch. Work on a short-lived branch named `feat/...`, `fix/...` or `docs/...` followed by a short kebab-case description, for example `feat/lead-list`. If you work from a fork, branch in your fork and open the pull request against `main` here.
- Open a pull request into `main` and fill in the [pull request template](.github/PULL_REQUEST_TEMPLATE.md). Pull requests are merged by **squash merge** only, so `main` gets exactly one commit per pull request, and that commit uses the pull request title.
- The **pull request title follows the commit format** (`type: subject`, lowercase, at most 72 characters). It is checked automatically.
- A pull request can merge only when all of these pass **and** it has **one approving review**:
  - lint, format check, type-check, test and build for the frontend and for the backend, plus the generated-file checks (both apps are always checked, whichever one you changed);
  - the pull request title check;
  - CodeQL code scanning;
  - dependency review;
  - the secret scan;
  - the dependency vulnerability audit (a high or critical vulnerability blocks the merge; moderate and low are reported only).
- CI also runs the `mobile` job on every push and pull request: the Flutter format check, analysis and tests. Keep it green.
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

For the mobile app, from inside `mobile/` (the same four steps the `mobile` job runs):

| What | Command |
| --- | --- |
| Install exactly what the lockfile says | `flutter pub get --enforce-lockfile` |
| Format check | `dart format --output=none --set-exit-if-changed .` |
| Lint and types | `flutter analyze --fatal-infos` |
| Tests | `flutter test` |

For the repository itself: `pnpm verify:foundation` (or `node scripts/verify-foundation.mjs`) checks that the standards, workflows, version pins and documents agree with each other, and that every relative link in the main documents resolves. Run it when you change a document, a workflow, a version or an environment variable.

Things to know:

- Backend tests need PostgreSQL. Start it with `docker compose up -d --wait db`; the tests create and use their own `opencrm_test` database, never your development one. If you changed `DB_PORT`, export a matching `DATABASE_URL` in your shell first. See [docs/standards/testing.md](docs/standards/testing.md).
- The frontend build needs `NEXT_PUBLIC_API_URL` set (the build fails and names the variable if it is missing or not a URL) and needs network access, because the page font is fetched at build time. For example: `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1 pnpm --dir frontend build`.
- If you change a backend route or schema, regenerate the API contract and the frontend types and commit both results: `pnpm --dir backend openapi:generate`, then `pnpm --dir frontend api:types`. A test fails until the committed `backend/openapi/openapi.json` matches the code, and CI fails until `frontend/src/lib/api/schema.d.ts` matches the contract. If the change affects the mobile app, update its hand-written models too.
- The pre-commit hook does not format Dart files. Run `dart format .` in `mobile/` before you commit.
- For a change to a web screen, check it at 375px, 768px and 1280px wide, in light and dark, and say so under "How it was tested" in the pull request.

## Security

Never open a public issue for a security vulnerability. Follow [SECURITY.md](SECURITY.md) to report it privately. Never commit secrets; the development credentials in `compose.yaml` and the `.env.example` files are for local development only.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By taking part you agree to uphold it.

## Licence

OpenCRM is licensed under the [Apache License 2.0](LICENSE). By submitting a contribution you agree that it is licensed under the same terms.
