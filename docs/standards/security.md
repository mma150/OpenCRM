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
| Dependency updates | [`.github/dependabot.yml`](../../.github/dependabot.yml) | One grouped weekly pull request per app (the mobile app's `pub` packages included) for routine updates; security updates open immediately and alone. |
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
- **The mobile app follows the same rules with Flutter's tools.** Every version in `mobile/pubspec.yaml` is exact, `mobile/pubspec.lock` is committed, CI installs with `flutter pub get --enforce-lockfile`, and the Flutter version itself is pinned in `environment.flutter` and in the `mobile` job (`pnpm verify:foundation` checks the pins and that the two Flutter versions agree). Approved packages: `flutter_riverpod`, `dio`, `go_router`, `flutter_secure_storage`, `intl`, and `flutter_lints` for development ([decision 0005](../decisions/0005-mobile-app-stack.md)). There is no `pub` counterpart of `pnpm audit` in CI: advisories for pub packages reach the repository through Dependabot alerts.
- **Backend packages approved later.** `pdfkit` (MIT, the PDF of quotes and invoices) and `@types/pdfkit` (MIT, development) were approved by the owner for QUOT-03 and pinned on 2026-10-14 after checking the names on npmjs.com. pdfkit brings `fontkit`, `linebreak`, `png-js`, `fflate`, `@noble/hashes`, `@noble/ciphers` and their own small dependencies; none of them runs an install script, so `allowBuilds` did not change.
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
| Flutter SDK | `https://github.com/flutter/flutter.git` at the tag `3.47.6` (cloned by the `mobile` job; no setup action) | Tag listed in the remote repository on 2026-10-13 |
| CI database | `postgres:18-alpine` (service container) | Same image as `compose.yaml` |
| Development mail inbox | `axllent/mailpit:v1.31.4` (Docker image, `compose.yaml` only) | Pulled and run locally on 2026-10-09 |

## The mobile app's session

The mobile app signs in with `POST /auth/token` and keeps a session token on the phone ([backend.md](backend.md#token-sign-in-for-clients-without-cookies), [mobile.md](mobile.md#signing-in-and-the-server-address)). The rules, each pinned by a test in `backend/src/modules/auth/auth.test.ts` or `backend/src/middleware/security.test.ts` unless it says otherwise:

- **The token route sets no cookie**, so its answer can never sign a browser in, and it is refused from an origin that is not allowed, like every other state-changing route.
- **It is no weaker than the cookie sign-in**: the same service function, the same rate limiters (one shared allowance per address and per email) and the same account lock.
- **The origin check still protects every cookie request.** A request without a session cookie and without an `Origin` passes (a native client); a request with a session cookie needs an allowed `Origin` even when it also carries a Bearer header.
- **Only a hash of the token is stored on the server.** On the phone the token is in the platform's secure storage (Keychain, Android Keystore) and nowhere else, and Android backups are off (`allowBackup="false"`). Enforced by code review: `mobile/lib/core/storage/key_value_store.dart` is the only file that stores anything.
- **The token is never logged**: the `authorization` header is redacted and request bodies are not logged.
- **Signing out on the phone works offline** (the token is forgotten first), and deactivating the user, resetting the password or 30 days without use end the session on the server.
- **Plain HTTP is for debug builds only.** A release build of the app accepts only an `https://` server address, Android refuses cleartext traffic outside the debug manifest, and iOS keeps App Transport Security on ([mobile.md](mobile.md#running-against-a-local-server)).

## CSV export and import

The CRM writes CSV files that people open in a spreadsheet and reads CSV files people give it. The rules, each pinned by a test (`backend/src/lib/csv.test.ts`, `csv-export.test.ts`, `modules/imports/imports.test.ts`, `modules/custom-fields/custom-fields.test.ts`):

- **Formula injection.** Excel, LibreOffice and Google Sheets run a cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return as a formula, so a lead named `=HYPERLINK(...)` could run on the machine of whoever opens an export. Every text cell the API writes into a CSV file gets a leading apostrophe when it starts with one of those characters (`neutraliseFormula` in `backend/src/lib/csv.ts`); numbers are written as numbers. This covers every export (the record lists, tasks, quotes, invoices, the activity feed, products and users) and the failed rows file of an import, because both are written with `writeSpreadsheetCsv`, the only function a file for people may be written with. The import removes that apostrophe again, so a round trip does not change the data.
- **An export shows what the list shows.** It runs the list's own query with the caller's visibility, so it can never hold a record, or the name of a linked record, that the caller may not see.
- **The users export holds no secrets.** `GET /users/export` is for Admins only and writes name, email, role, status, manager and created: never a password hash, an invite or reset token, a session or the sign-in lock (`failedLoginCount`, `lockedUntil`). `users.test.ts` checks the file for each.
- **Notifications are never exported.** They are one person's inbox, not business data, so there is no route that writes them to a file.
- **A download cannot be cached or sniffed.** Exports are served with `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `Content-Disposition: attachment`.
- **An export is a GET**, so the origin check does not apply to it. That is safe because it changes nothing, and another site cannot read the response: CORS allows only the origins in `CORS_ORIGINS`, and the session cookie is `SameSite=Lax`.
- **No file upload.** An import sends the file's text in a JSON body; there is no multipart parser and nothing is written to disk.
- **Large bodies only after sign-in.** Every route reads at most 100 kB of JSON, except the import routes, which read up to 12 MB, and only after the session and the role were checked, so an anonymous or Read-only caller cannot make the API read a large body. The file itself is limited to 5 MB and 5,000 rows.
- **An import can store nothing the forms could not.** Every row goes through the Zod schema of the record's create route and the custom field rules; the mapping accepts only the field keys `GET /imports/fields` lists.
- **Custom field filters are parameters.** A `cf.<field id>` filter is used only after the id matched a real field in use of that record type; the id and the value reach PostgreSQL as bound parameters through Prisma, never as SQL text. The one raw statement, which removes a deleted field's values, takes its table name from a constant and the field id as a parameter.
- **Logs.** A row of an import is never logged; a batch that fails is logged by the error's name only.

## Secrets the app stores

Almost every secret of an installation lives in its environment and never in the database. The one exception is the **SMTP password an Admin saves under Settings > Email** (MAIL-01), which the API has to read back to log in to the mail server. The rules, each pinned by a test (`backend/src/lib/secret-box.test.ts`, `mailer.test.ts`, `modules/email-settings/email-settings.test.ts`):

- **Encrypted at rest.** The password is stored as `v1:<iv>:<auth tag>:<ciphertext>` in `MailSettings.passwordEncrypted`, written by `encryptSecret` in [`backend/src/lib/secret-box.ts`](../../backend/src/lib/secret-box.ts): AES-256-GCM from `node:crypto`, a fresh random 96-bit IV for every write, and a 256-bit key derived with HKDF-SHA-256 from the environment variable **`SETTINGS_ENCRYPTION_KEY`** (at least 32 characters, checked at start-up). GCM authenticates the value: one that was changed, or written with another key, fails to decrypt instead of decrypting to something else.
- **The key is not in the database.** A copy of the database, a backup or a SQL injection therefore does not reveal the password. Whoever holds both the database and the environment can read it; that is the limit of this control, and why the variable belongs with the installation's other secrets.
- **Never stored in plain text.** Without `SETTINGS_ENCRYPTION_KEY` a request that sends a password is refused with `ENCRYPTION_KEY_MISSING` and saves nothing. There is no fallback to plain text and no built-in default key. The `SMTP_PASSWORD` environment variable stays available for an installation that prefers to keep the password out of the database altogether.
- **Never returned.** No response carries the password or its ciphertext: `GET /settings/email` answers `hasPassword`. It is not logged either (request bodies are never logged, and the mailer logs only the error of a failed send).
- **Rotating or losing the key** makes the stored password unreadable. The API then says so (`passwordUnreadable`) and refuses to send rather than trying without a password; an Admin enters the password again. Nothing else is encrypted with the key today.
- **Development.** `compose.yaml` sets a key that is published in this repository. It protects nothing; never reuse it. Generate a real one with `openssl rand -base64 48`.

## Outgoing email

- **Admins choose the mail server; nobody else can.** `/settings/email` (except the yes-or-no `status`) is behind `requireRole("ADMIN")`. An Admin can therefore make the API open an SMTP connection to any host and port it can reach, the internal network included. That is inherent in configuring a mail server, so the request is kept from being useful as a probe: the connection times out after 10 seconds (20 per operation), the API speaks only SMTP, and a failure is answered with one of the API's own sentences and the SMTP status number, **never** with what the other side said (`mailer.test.ts` and `email-settings.test.ts` check that the server's text reaches no response). The test route is rate-limited like every other send.
- **Users cannot use the installation as a relay for bulk mail.** Sending is limited to 30 emails per user per 5 minutes, 10 addresses in `to` and 10 in `cc`, and needs a record the user may write on. The From address is always the configured one: a request cannot set `from`, `replyTo` or `bcc` (strict bodies).
- **No header injection.** A subject is one line (a line break is `VALIDATION_FAILED`), and a subject built from a placeholder is collapsed to one line before it is sent; addresses must be plain email addresses; the From name may not hold `<`, `>`, `"` or a line break. nodemailer encodes the headers.
- **Plain text only.** Nothing a user typed is interpreted as markup, in the email or on the timeline. Placeholders are replaced once, from a fixed list; a value is never expanded again.
- **No file or URL access from a message.** The transport is created with `disableFileAccess` and `disableUrlAccess`, so a message cannot be made to read a path or fetch an address. The one attachment, a quote's PDF, is drawn in memory by the API from the quote the sender may see; no request can name a file to attach (the send body is strict and has no attachment field).
- **A PDF holds what the caller may read, and only that.** `GET /quotes/:id/pdf` and `GET /invoices/:id/pdf` go through the same access check as the record (`NOT_FOUND` outside the caller's reach), are served with `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `Content-Disposition: attachment`, and the file name is the document's number with anything but letters, digits and dashes removed. Text typed by users is drawn as text with the standard fonts: nothing in it is interpreted (no links, scripts or form fields), and characters the fonts lack become `?`.
- **What a sender may address.** A user may write to any address, not only to the record's contacts; the email is written on the record's timeline under their name, where an Admin and their manager see it.
