# Commit standard

Every commit message and every pull request title in OpenCRM follows one short format. A local commit hook checks commit messages, and CI checks the pull request title with the same configuration ([`commitlint.config.mjs`](../../commitlint.config.mjs)).

Related: [CONTRIBUTING](../../CONTRIBUTING.md), [testing](testing.md).

## Format

```text
type(scope): subject
```

- `type` and `subject` are required. The `scope` in brackets is optional.
- Keep it to one line. The description of a change belongs in the pull request, not in a long commit body.

```text
feat: add lead list
fix(api): handle null company name
```

## Allowed types

Exactly these ten types are accepted. Any other word is rejected.

| Type | Use it for |
| --- | --- |
| `feat` | A new feature or behaviour a user can see |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `style` | Formatting or whitespace, no change in behaviour |
| `refactor` | Code restructuring that changes no behaviour |
| `test` | Adding or changing tests only |
| `chore` | Maintenance that fits nowhere else (dependencies, tooling files) |
| `ci` | Continuous integration and workflow files |
| `build` | Build setup, Dockerfiles, compose files |
| `perf` | A change made to improve performance |

## Rules

- **The subject must not start with an uppercase letter.** `feat: add OpenAPI endpoint` is accepted (an uppercase letter inside the subject is fine) and `feat: Add endpoint` is rejected. This is how "lowercase subject" is read for this project; if you want the stricter reading (no capital letter anywhere in the subject), raise it with the maintainers before changing the configuration.
- **The header line is at most 72 characters.** The header is the first line, `type(scope): subject`. It is counted the way commitlint counts it: the length of that line as a JavaScript string, so every letter, digit, space and punctuation mark is one character. A letter such as `é` is one character; an emoji counts as two.
- The subject is required and not empty.
- The body is optional and has no line-length limit, but keep commits short.
- The scope is optional. When used it names the area, for example `api`, `leads` or `docs`.

Worked example of the 72 limit. This header is exactly 72 characters and is accepted:

```text
feat(leads): add company name search to the lead list and the filter bar
```

Adding one letter (`bars` instead of `bar`) makes it 73 characters and it is rejected:

```text
feat(leads): add company name search to the lead list and the filter bars
```

## No AI attribution

Commits and pull requests must never contain a `Co-Authored-By` line or any other AI attribution, such as a "Generated with" Claude marker or an `anthropic.com` no-reply address. The hook rejects a commit message that contains one, and the pull request title and description follow the same rule. The matching is case-insensitive.

## Accepted examples

```text
feat: add lead list
fix(api): handle null company name
docs: add OpenAPI notes
chore(deps): update lint-staged
refactor(auth): split token helpers
```

## Rejected examples

| Message | Why it is rejected |
| --- | --- |
| `Added stuff` | No type |
| `feature: add thing` | `feature` is not one of the ten types |
| `feat: Add thing` | The subject starts with an uppercase letter |
| `feat:` | A type with no subject |
| (an empty message) | Nothing to check; there is no type and no subject |
| a header of 73 characters | Longer than 72 |
| `feat: add lead list` followed by a `Co-Authored-By: ...` line | AI attribution and co-author trailers are not allowed |

## Branches and pull requests

- `main` is the only long-lived branch. Work on a short-lived branch named `feat/...`, `fix/...` or `docs/...` (the type, a slash, a short description) and open a pull request into `main`.
- Pull requests are merged by **squash merge** only, so `main` has one commit per pull request.
- The **pull request title follows the commit format** above and is checked in CI. The squash commit uses the pull request title, so the title becomes the commit message on `main`.

## Local hooks

The repository installs two git hooks (through husky) when you run `pnpm install` at the repository root:

- **`commit-msg`** runs commitlint on your message and rejects the commit, creating nothing, if the message breaks this standard.
- **`pre-commit`** first runs lint-staged, which fixes the staged files with that app's own ESLint and Prettier (`backend/` and `frontend/`), then scans the staged changes for credentials with gitleaks. A staged credential stops the commit.

To make the hooks work on your machine:

1. Run `pnpm install` at the repository root, and again inside `backend/` and `frontend/`. lint-staged uses each app's own ESLint and Prettier and stops with a message if an app's dependencies are missing.
2. Have either a `gitleaks` binary on your PATH, or Docker running. The scan uses the `gitleaks` binary if it finds one and otherwise runs the pinned image `ghcr.io/gitleaks/gitleaks:v8.30.1`. If neither is available the commit fails with install instructions; the scan is never skipped.

If a hook rejects your commit, fix the message or the staged content and commit again.
