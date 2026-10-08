# Security practices

Security is tracked continuously: every check below runs on every push and pull request, and most also run on a schedule, so a new advisory is found without anyone touching the code. None of them is advisory. A failing security check blocks the merge.

Related: [GitHub repository settings](github-settings.md), [commit standard](commits.md), the [security policy](../../SECURITY.md) for reporters.

## Where each control lives

| Control | Where it lives | What it does |
| --- | --- | --- |
| Secret scan, layer 1 | [`.husky/pre-commit`](../../.husky/pre-commit) and [`scripts/scan-staged-secrets.sh`](../../scripts/scan-staged-secrets.sh) | Scans the staged changes before a commit exists. |
| Secret scan, layer 2 | [`.github/workflows/secrets.yml`](../../.github/workflows/secrets.yml) (job `gitleaks`) | Scans the full git history on every push and pull request. |
| Secret scan, layer 3 | GitHub secret scanning with push protection (repository setting) | Blocks a push that contains a known credential format. |
| Dependency audit | [`.github/workflows/audit.yml`](../../.github/workflows/audit.yml) (job `audit`) | `pnpm audit --audit-level=high` in both apps, on push, pull request and weekly. High and critical fail; moderate and low are only reported. |
| Dependency review | the same workflow (job `dependency-review`) | Fails a pull request that introduces a dependency with a high or critical advisory. |
| Dependency updates | [`.github/dependabot.yml`](../../.github/dependabot.yml) | One grouped weekly pull request per app for routine updates; security updates open immediately and alone. |
| Code scanning | [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml) (job `analyze`) | CodeQL for JavaScript and TypeScript on pull requests, on pushes to `main` and weekly. |
| Disclosure path | [`SECURITY.md`](../../SECURITY.md) | Tells a reporter how to report a vulnerability privately. |
| Repository consistency | [`scripts/verify-foundation.mjs`](../../scripts/verify-foundation.mjs) (`pnpm verify:foundation`) | Fails when a workflow loses a security rule, for example `continue-on-error` or an inlined pull request title. |

## Secret scanning (D-23)

Secrets are caught in three places, because each layer has a gap the next one covers: the hook can be skipped on a contributor's machine, CI sees only what was pushed, and push protection only knows the credential formats GitHub recognises.

- **One scanner, one version.** The hook and the CI job both use gitleaks `v8.30.1`, from the pinned image `ghcr.io/gitleaks/gitleaks:v8.30.1` (the hook prefers a `gitleaks` binary on your `PATH`). `pnpm verify:foundation` fails if the two tags differ. Change both together.
- **The CI scan cannot pass without scanning.** gitleaks reports "0 commits scanned" and "no leaks found" with exit code 0 when it cannot read the repository, for example in a linked git worktree or when git refuses to read a folder owned by another user. The `gitleaks` job therefore refuses a shallow checkout, counts on the runner the commits that have a diff, and fails unless gitleaks reports exactly that many scanned commits. The job uses the `detect` subcommand of the pinned image, which scans the same git history as the newer `git` subcommand; if the pin is ever moved to a major version without `detect`, the job fails loudly rather than skipping.
- **No GitHub Action.** `gitleaks/gitleaks-action` needs a paid licence for repositories owned by an organisation, so CI runs the image directly.
- **If a real secret is ever committed**, rotate it first. Removing it from the history does not make it safe again.

## Dependency rules

- **Exact pins.** Every version in the three `package.json` files is exact (no `^`, `~`, `*` or `latest`). Each app and the repository root have their own `pnpm-lock.yaml`, and installs use `--frozen-lockfile` (CI always does). `pnpm verify:foundation` checks the pins.
- **Owner approval.** Adding, removing or changing a dependency, a version, a `pnpm-workspace.yaml` or a lockfile needs the owner's approval, and the package name must be checked on npmjs.com first. A failed install is a reason to stop and check the name, never to try a similar one.
- **Install scripts (`allowBuilds`).** pnpm 11 blocks install scripts except for the packages listed in each app's `pnpm-workspace.yaml`:

  | App | Packages allowed to run install scripts |
  | --- | --- |
  | `backend/` | `@prisma/engines`, `prisma`, `esbuild` |
  | `frontend/` | `unrs-resolver`, `sharp` |

- **Release age.** pnpm refuses a release younger than one day (`minimumReleaseAge`). Two shadcn releases were younger on 2026-10-08 and are listed in `minimumReleaseAgeExclude` in `frontend/pnpm-workspace.yaml` (`shadcn@4.21.4`, `@shadcn/registry@0.1.3`). Remove both lines once the releases are a day old. Dependabot has a two-day `cooldown` so that its lockfile pull requests do not pick a release pnpm would refuse.
- **Overrides.** Two transitive packages reach the backend through the Prisma CLI with a high advisory on the day the dependencies were pinned. They are overridden in `backend/pnpm-workspace.yaml`:

  | Override | Version forced | Why | Remove when |
  | --- | --- | --- | --- |
  | `deepmerge-ts` | `>=8.0.0` | Patched version of a transitive dependency of the Prisma CLI | A Prisma release depends on a patched `deepmerge-ts` itself. Delete the override, run `pnpm install` and `pnpm audit --audit-level=high` in `backend/`; if it exits 0, keep it deleted. |
  | `mysql2` | `>=3.23.1` | Patched version of a transitive dependency of the Prisma CLI | The same test with `mysql2`. |

- **Ignored majors in Dependabot.** `typescript` (both apps; typescript-eslint does not support TypeScript 7), `@types/node` (both apps; it must follow the Node major in `.nvmrc`) and, in the backend, `prisma`, `@prisma/client` and `@prisma/adapter-pg` (Prisma 8 is a deliberate migration). Remove an entry from `.github/dependabot.yml` when that migration is planned.

## Audit allow-list

`pnpm audit --audit-level=high` must exit 0 in both apps. An advisory that has **no patched version** may be ignored only through a row in this table: the advisory id, the reason, the date it was accepted and a review date. An ignore anywhere else, such as a bare `ignoreGhsas` entry, an `--ignore` flag or `continue-on-error`, is not allowed.

| Advisory | Package | App | Reason | Accepted | Review by |
| --- | --- | --- | --- | --- | --- |
| `GHSA-vfj7-8cjw-p6xm` | `braces` (<=3.0.3) | `frontend/` | Stack exhaustion on deeply nested glob patterns. No patched version is published. Reached only through build-time tooling (`eslint-config-next` and the `shadcn` CLI) that globs patterns this repository writes itself; `braces` is not part of the shipped application. Owner-accepted in plan 01-01. | 2026-10-08 | 2027-01-08, or as soon as a patched `braces` exists |

The matching entry is `auditConfig.ignoreGhsas` in `frontend/pnpm-workspace.yaml`; remove it together with this row when a patched `braces` is in the lockfile. The backend has no ignore.

## Dependabot and the pull request title check

The `pr-title` job checks the pull request title and its commits against the [commit standard](commits.md). Dependabot pull requests are **exempt**: its titles are forced to start with `chore:` by `commit-message.prefix` in `.github/dependabot.yml`, but a title such as `chore: bump @prisma/adapter-pg from 7.10.0 to 7.10.1` can pass 72 characters when the package name is long. The job is skipped for pull requests opened by `dependabot[bot]`, and a skipped job counts as passed for a required check. Dependabot pull requests still have to pass `frontend`, `backend`, `analyze`, `dependency-review`, `gitleaks` and `audit`.

## Workflow rules

- **Read-only token.** Every workflow starts with `permissions: contents: read`. Only the CodeQL job adds `security-events: write`.
- **No script injection.** A pull request title, branch name or commit message is untrusted. It reaches a script only through an environment variable (the `pr-title` job passes `PR_TITLE` that way), never through a `${{ }}` expression inside a `run:` script. `pnpm verify:foundation` fails if any `run:` script contains `${{ }}`.
- **No advisory security jobs.** No workflow may use `continue-on-error`; `pnpm verify:foundation` fails if one does.
- **Always-running required checks.** No workflow has a `paths` or `paths-ignore` filter, because a required check that was skipped by a filter never reports.

### Third-party actions and images

Actions are pinned by major version tag; Dependabot's `github-actions` entry keeps them current. Pinning by full commit SHA is stricter and is an option for the owner later (Dependabot maintains SHA pins too).

| Used for | Reference | Confirmed |
| --- | --- | --- |
| Checkout | `actions/checkout@v7` | Tag listed in the remote repository on 2026-10-08 |
| Node setup and cache | `actions/setup-node@v7` | Tag listed in the remote repository on 2026-10-08 |
| pnpm setup | `pnpm/action-setup@v6` | Tag listed in the remote repository on 2026-10-08 |
| CodeQL | `github/codeql-action/init@v4`, `github/codeql-action/analyze@v4` | Tag listed in the remote repository on 2026-10-08 |
| Dependency review | `actions/dependency-review-action@v5` | Branch and tag `v5.0.0` listed in the remote repository on 2026-10-08 |
| Secret scan | `ghcr.io/gitleaks/gitleaks:v8.30.1` (Docker image) | Pulled and run locally |
| CI database | `postgres:18-alpine` (service container) | Same image as `compose.yaml` |
