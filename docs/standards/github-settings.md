# GitHub repository settings

Most of the protection described in the [contributing guide](../../CONTRIBUTING.md) is configured in the GitHub web interface, not in files. This checklist is for the repository owner. It is written in the order to do the steps. Nothing in it can be committed, and none of it has been applied yet: the repository had no GitHub remote when these files were written.

**Assumption to confirm:** the repository is **public**. Free CodeQL, secret scanning and dependency review depend on that. If it will be private, read [If the repository is private](#if-the-repository-is-private) before you start. The steps are the same whether a user or an organisation owns the repository.

Related: [security practices](security.md), [commit standard](commits.md).

## Before the first push

1. Create an empty repository on GitHub (no README, licence or `.gitignore`: the repository already has them).
2. Add it as a remote and push `main`:

   ```sh
   git remote add origin <the repository URL>
   git push -u origin main
   ```

3. Check that no owner-input placeholder is left before the repository is public. The security contact in [`SECURITY.md`](../../SECURITY.md) (GitHub private vulnerability reporting only) and the conduct contact in [`CODE_OF_CONDUCT.md`](../../CODE_OF_CONDUCT.md) (a private message to the maintainer's GitHub account) are filled in. Run `pnpm verify:foundation`: it prints a `WARN` line for each placeholder that is left. Do not use a personal address you do not want published.
4. Open **Settings -> Actions -> General** and set **Workflow permissions** to **Read repository contents and packages permissions**. Every workflow also asks for read-only access itself; this makes read-only the default for any future workflow.

The first push starts the workflows. `pr-title` and `dependency-review` only run on pull requests, so a required check list cannot be completed until a pull request has run them once (see [Required status checks](#required-status-checks)).

## Repository settings

Under **Settings**:

| Where | Setting | Value |
| --- | --- | --- |
| Advanced Security (or Code security) | Dependency graph | On |
| Advanced Security | Dependabot alerts | On |
| Advanced Security | Dependabot security updates | On |
| Advanced Security | Secret scanning | On |
| Advanced Security | **Push protection** (under secret scanning) | On |
| Advanced Security | Private vulnerability reporting | On. [`SECURITY.md`](../../SECURITY.md) tells reporters to use it. |
| Advanced Security | Code scanning, CodeQL analysis | **Leave the default setup off.** The workflow file [`codeql.yml`](../../.github/workflows/codeql.yml) is the advanced setup, and the two cannot both be on. |
| General -> Pull Requests | Allow merge commits | Off |
| General -> Pull Requests | Allow squash merging | **On, and the only merge method** |
| General -> Pull Requests | Allow rebase merging | Off |
| General -> Pull Requests | Default commit message for squash merging | **Pull request title** (the other options copy commit bodies, which may carry a forbidden `Co-authored-by` line) |
| General -> Pull Requests | Automatically delete head branches | On |

Dependabot version updates need no switch: they start when [`.github/dependabot.yml`](../../.github/dependabot.yml) is on the default branch.

## Branch protection for main

Create a **branch protection rule** (or a **ruleset**) for `main` under **Settings -> Branches** (or **Rules**):

- Require a pull request before merging.
- Require **1 approving review**. Recommended as well: dismiss stale approvals when new commits are pushed.
- Require status checks to pass before merging, with the seven checks in the next section.
- Block force pushes.
- Block deletion of the branch.
- Recommended: apply the rule to administrators too, so it binds the owner as well.

**One approving review and a single maintainer.** GitHub does not let an author approve their own pull request. With one maintainer, either add a second reviewer, or let the owner bypass the rule on purpose (a ruleset bypass for the owner). This is the owner's decision; the checklist does not choose.

## Required status checks

Add exactly these seven. The names are the job ids in the workflow files and are stable, so renaming a job breaks branch protection.

| Check | Workflow | What it proves |
| --- | --- | --- |
| `frontend` | [`ci.yml`](../../.github/workflows/ci.yml) | Lint, format check, type-check, test, build and the generated API types for the web app |
| `backend` | [`ci.yml`](../../.github/workflows/ci.yml) | The same for the API, against a PostgreSQL service, plus the OpenAPI document |
| `pr-title` | [`pr-title.yml`](../../.github/workflows/pr-title.yml) | The pull request title and commits follow the [commit standard](commits.md) |
| `analyze` | [`codeql.yml`](../../.github/workflows/codeql.yml) | CodeQL found nothing blocking in JavaScript and TypeScript |
| `dependency-review` | [`audit.yml`](../../.github/workflows/audit.yml) | The pull request adds no dependency with a high or critical advisory |
| `gitleaks` | [`secrets.yml`](../../.github/workflows/secrets.yml) | No secret in the full git history |
| `audit` | [`audit.yml`](../../.github/workflows/audit.yml) | `pnpm audit --audit-level=high` passes in both apps |

Notes:

- GitHub only offers a check in the picker after it has run once, so open a first pull request (for example the "Bad title" test below), let all workflows run, and then add the checks.
- Both app checks always run, whichever app a pull request changes. There are no path filters on purpose: a required check that a filter skipped never reports and would block the pull request forever. A change that touches only documentation still reports `frontend` and `backend`.
- `pr-title` is skipped for Dependabot pull requests, and `dependency-review` only runs on pull requests. A skipped job counts as passed.

## After the first push

These can only be checked on GitHub. Each takes about a minute.

1. **CI runs green (CI-01).** Open the **Actions** tab on the push. `ci` shows `frontend` and `backend`; `audit`, `secrets` and `codeql` run too.
2. **A bad pull request title fails (CI-02).** Open a throwaway pull request titled `Bad title`. `pr-title` fails. Edit the title to `chore: test title check`; the check runs again and passes.
3. **Dependabot is active (SEC-01).** **Insights -> Dependency graph -> Dependabot** lists the ecosystems from `dependabot.yml` (npm for `/`, `/frontend` and `/backend`, GitHub Actions, Docker, Docker Compose) and shows no configuration error.
4. **CodeQL runs (SEC-02).** The first run appears under **Security -> Code scanning**, for the pull request and for the push to `main`.
5. **Secrets are blocked (SEC-03).** With push protection on, push a commit that contains a made-up credential to a throwaway branch and confirm GitHub blocks the push; also confirm the `gitleaks` job ran.
6. **Branch protection works (CTB-05).** A pull request cannot be merged without the seven checks and one approval, and only the squash button is offered.
7. **Security links work.** In **Issues -> New issue**, the **Report a security vulnerability** link (from [`.github/ISSUE_TEMPLATE/config.yml`](../../.github/ISSUE_TEMPLATE/config.yml)) opens the private vulnerability report form, and **Security -> Report a vulnerability** is available. Private vulnerability reporting must be switched on (see [Repository settings](#repository-settings)); GitHub offers it for public repositories.
8. **Weekly runs.** After the first Monday, `codeql` and `audit` show a scheduled run, and Dependabot has opened its grouped pull requests (one per app). Dependabot re-checking an unchanged manifest must not open a duplicate pull request.

## If the repository is private

Several checks rely on features that are free for public repositories and need **GitHub Advanced Security** (a paid add-on) for private ones.

| Feature | Public | Private |
| --- | --- | --- |
| CodeQL code scanning (`analyze`) | Free | Needs GitHub Advanced Security. Without it the `analyze` job cannot upload results; remove it from the required checks. |
| Dependency review (`dependency-review`) | Free | Needs GitHub Advanced Security. Without it the job fails; remove it from the required checks and rely on `audit`. |
| Secret scanning and push protection | Free | Needs GitHub Advanced Security. The `gitleaks` job and the pre-commit hook still work, so two of the three layers remain. |
| Dependabot alerts, security updates, version updates | Free | Free |
| `frontend`, `backend`, `pr-title`, `audit`, `gitleaks` | Work | Work (they use GitHub-hosted runners, whose minutes are limited on a free private plan) |

Without GitHub Advanced Security the dependency gate is the `audit` job alone, and code scanning is not available. Decide whether that is acceptable before making the repository private.
