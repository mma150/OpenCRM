---
phase: 01-repository-foundation-standards
plan: 08
subsystem: infra
tags: [commitlint, husky, lint-staged, gitleaks, docker, git-hooks, commit-standard]
status: complete

requires:
  - phase: 01-repository-foundation-standards
    provides: root tooling manifest and lockfile (plan 01-01), each app's ESLint and Prettier setup (plans 01-04 and 01-06), documents that link to docs/standards/commits.md (plan 01-09)
provides:
  - "commitlint.config.mjs: the commit standard as configuration, exporting TYPES (ten types) and the inline rule no-ai-attribution, reusable by the pull request title check in plan 01-10"
  - "docs/standards/commits.md: the written commit, branch and pull request title standard"
  - "scripts/test-commitlint.mjs and scripts/test-secret-hook.mjs: fixture tests behind pnpm test:commitlint and pnpm test:secret-hook"
  - "scripts/scan-staged-secrets.sh: gitleaks over staged changes (binary, else pinned Docker image), never skipped"
  - "lint-staged.config.mjs, .husky/pre-commit, .husky/commit-msg and the root prepare script: active local hooks"
  - ".editorconfig"
affects: [01-10, phase-02]

actuals:
  tokens: 7000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "One commit standard file (commitlint.config.mjs) used by the local hook and, later, by CI"
    - "Hook scripts that fail closed: a missing scanner, a missing app node_modules or a failing tool aborts the commit"
    - "Fixture tests that assert the specific commitlint rule that rejected a message, not just a non-zero exit"

key-files:
  created:
    - commitlint.config.mjs
    - lint-staged.config.mjs
    - .editorconfig
    - .husky/pre-commit
    - .husky/commit-msg
    - scripts/scan-staged-secrets.sh
    - scripts/test-commitlint.mjs
    - scripts/test-secret-hook.mjs
    - docs/standards/commits.md
  modified:
    - package.json

key-decisions:
  - "Assumption A5 (owner unconfirmed): D-14 'lowercase subject' is implemented as 'the subject must not start with an uppercase letter' (config-conventional subject-case). feat: add OpenAPI endpoint is accepted, feat: Add endpoint is rejected. Stated in docs/standards/commits.md in exactly these words."
  - "The 72 limit is the JavaScript string length of the header line (UTF-16 units), so an emoji counts as two; stated with a worked 72/73 example in commits.md and covered by fixtures"
  - "The Docker scan path pipes the added lines of the staged diff (made on the host) into the pinned gitleaks image instead of mounting the repository, because the mounted form fails open in linked git worktrees (see Deviations)"
  - "lint-staged starts each app's own ESLint and Prettier with node from the app's node_modules (cwd = the app folder) instead of pnpm --dir, because pnpm 10 cannot run inside the app folders (see Deviations)"

patterns-established:
  - "Hooks live in .husky/ as two-line LF scripts; the logic lives in scripts/ and lint-staged.config.mjs so it can be tested"

requirements-completed: [FND-02, CTB-03, CTB-04, SEC-03]

coverage:
  - id: D1
    description: "docs/standards/commits.md documents format, the ten types, the 72 character rule with a worked example, no AI attribution, rejected examples (including empty message and type with no subject), branches and pull requests, and the local hooks"
    requirement: CTB-03
    verification:
      - kind: other
        ref: "grep of the eight headings, the ten type names and the number 72 in docs/standards/commits.md (all present)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A commit whose message breaks the standard is rejected by the commit-msg hook and no commit is created; a compliant message is accepted"
    requirement: CTB-04
    verification:
      - kind: other
        ref: "pnpm test:commitlint (19 of 19 fixtures); real git commit --allow-empty with 'Bad message', 'feat: Add thing', an over-long header, an empty message and a Co-Authored-By trailer: each exit non-zero, HEAD unchanged; commit 'chore(01-08): add commit hooks' accepted"
        status: pass
    human_judgment: false
  - id: D3
    description: "A staged credential is blocked by the pre-commit hook, and a missing scanner or unreachable Docker daemon fails the commit instead of passing"
    requirement: SEC-03
    verification:
      - kind: other
        ref: "pnpm test:secret-hook (4 of 4 cases); real git commit with a staged run-time-generated GitHub token shape blocked ('leaks found: 1', HEAD unchanged); real commit with DOCKER_HOST pointing nowhere blocked with install instructions"
        status: pass
    human_judgment: false
  - id: D4
    description: "Staged backend and frontend files are auto-fixed by that app's ESLint and Prettier before the commit is created"
    requirement: FND-02
    verification:
      - kind: other
        ref: "backend/src/lib/prisma.ts staged with 'export   const   poolSize  =  5' then pnpm exec lint-staged: exit 0, staged diff shows 'export const poolSize = 5;'. Staged '(any)' type: exit 1, no-explicit-any reported, original state restored. Only the backend path was exercised; the frontend task is the same code with another folder name"
        status: pass
    human_judgment: false
  - id: D5
    description: "Which secret formats count as a credential, and whether 'lowercase subject' means 'no leading capital' or 'no capital anywhere'"
    verification: []
    human_judgment: true
    rationale: "The secret rule set is whatever the gitleaks defaults detect (no custom rules planned), and the subject-case reading is assumption A5; both are owner decisions no test can assert"

duration: ~55 min
completed: 2026-10-08
---

# Phase 1 Plan 08: Commit Standard and Local Hooks Summary

**Commit standard enforced locally: commitlint (ten types, 72-character header, uppercase-start and AI-attribution rejection) in a commit-msg hook, and a pre-commit hook that auto-fixes staged app files with lint-staged and blocks staged credentials with a pinned gitleaks Docker image that fails loudly when no scanner can run.**

## Performance

- **Duration:** about 55 min
- **Completed:** 2026-10-08
- **Tasks:** 3
- **Files:** 9 created, 1 modified (plus this summary)

## Accomplishments

- `commitlint.config.mjs` extends config-conventional, restricts `type-enum` to `TYPES`, sets `header-max-length` 72 at error level and adds the inline rule `no-ai-attribution` (Co-Authored-By trailer, "Generated with [Claude" marker, anthropic no-reply address, case-insensitive).
- `docs/standards/commits.md` written at the path README and CONTRIBUTING already link to, with all eight required headings, a 72/73 worked example and both empty-message and type-without-subject under Rejected examples. It describes no way around the hooks.
- The hooks are active in this repository (`core.hooksPath` is `.husky/_`) and checked this plan's own task commits after Task 3.
- `scripts/scan-staged-secrets.sh` uses a gitleaks binary if present, otherwise the pinned image `ghcr.io/gitleaks/gitleaks:v8.30.1` (tag appears once), otherwise prints install instructions and exits 1.

## Fixture results

`pnpm test:commitlint` (19 of 19 behaved as expected; a rejection must come from the named rule):

| Fixture | Expected | Rule that rejected |
| --- | --- | --- |
| `feat: add lead list` | accept | - |
| `fix(api): handle null` | accept | - |
| `docs: add OpenAPI notes` | accept | - |
| header of exactly 72 characters | accept | - |
| 72 character header with a non-ASCII letter (`é`) | accept | - |
| 72 UTF-16 units containing an emoji (71 code points) | accept | - |
| `Added stuff` (no type) | reject | type-empty |
| `feat: Add thing` | reject | subject-case |
| `feature: add thing` | reject | type-enum |
| `feat:` (empty subject) | reject | subject-empty |
| empty message | reject | (commitlint refuses empty input) |
| whitespace-only message | reject | (commitlint refuses empty input) |
| header of 73 characters | reject | header-max-length |
| 73 character header with `é` | reject | header-max-length |
| 73 UTF-16 units containing an emoji (72 code points) | reject | header-max-length |
| valid header plus Co-Authored-By trailer | reject | no-ai-attribution |
| same trailer in lower case | reject | no-ai-attribution |
| valid header plus "Generated with [Claude Code]" line | reject | no-ai-attribution |
| valid header plus the anthropic no-reply address | reject | no-ai-attribution |

`pnpm test:secret-hook` (4 of 4):

| Case | Result |
| --- | --- |
| staged run-time-generated GitHub token shape | exit 1, "leaks found", token not printed in clear |
| staged harmless file | exit 0 |
| PATH containing nothing (no gitleaks, no docker) | exit 1, names gitleaks and Docker |
| docker on PATH but daemon unreachable (`DOCKER_HOST=tcp://127.0.0.1:1`), no gitleaks | exit 1, install instructions |

Scanner used on this machine: **the pinned Docker image** (no gitleaks binary is installed; Docker 29.4.0 daemon running). The gitleaks binary branch is unexercised here.

## Real-repository proofs (hooks active, worktree `worktree-agent-ab23c5e7bac1287be`)

HEAD stayed `b042ee5` through every rejected attempt:

- `git commit --allow-empty -m "Bad message"`: exit 1, `subject-empty` and `type-empty`.
- `git commit --allow-empty -m "feat: Add thing"`: exit 1, `subject-case`.
- `feat: this header is much much longer than the seventy-two character limit allows`: exit 1, `header-max-length` (81).
- header plus a Co-Authored-By body line: exit 1, `no-ai-attribution`.
- empty message: exit 1, git aborts.
- staged file holding a run-time-generated GitHub token shape, message `chore: probe secret hook`: exit 1, pre-commit "leaks found: 1". File removed afterwards, never committed.
- `DOCKER_HOST=tcp://127.0.0.1:1 git commit -m "chore: probe unavailable scanner"` with `.editorconfig` staged: exit 1 with the install instructions.
- `chore(01-08): add commit hooks`: accepted through both hooks (`d492d66`).
- Scan of `git log -p --all` plus the staged diff through the pinned image: no leaks (includes `scripts/test-secret-hook.mjs`).

## Task Commits

1. **Task 1: Commit standard as commitlint configuration, fixture test and written document** - `e58c372` (feat)
2. **Task 2: Staged secret scan that never skips, with a scripted proof** - `b042ee5` (feat)
3. **Task 3: lint-staged and husky hooks, activated last** - `d492d66` (chore)

**Plan metadata:** the commit that adds this file (docs).

## Files Created/Modified

- `commitlint.config.mjs` - the commit standard; exports `TYPES`
- `docs/standards/commits.md` - the written standard
- `scripts/test-commitlint.mjs` - 19 fixtures piped to `pnpm exec commitlint`
- `scripts/scan-staged-secrets.sh` - staged secret scan (LF)
- `scripts/test-secret-hook.mjs` - 4 cases in temporary repositories outside this repository
- `lint-staged.config.mjs` - per-app ESLint `--fix --max-warnings 0` then Prettier; Prettier only for md/json/css/yml/yaml
- `.husky/commit-msg`, `.husky/pre-commit` - the two hooks (LF)
- `.editorconfig` - root, utf-8, LF, final newline, two spaces, trimmed whitespace
- `package.json` - added `"prepare": "husky"` only; dependency lists, `pnpm-workspace.yaml` and `pnpm-lock.yaml` unchanged

## Decisions Made

See `key-decisions` above. Both are consequences of defects found while proving the plan's literal design.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The Docker scan failed open inside a linked git worktree**
- **Found during:** Task 2
- **Issue:** The research command (mount the repository into the container and run `gitleaks git --staged`) reported `fatal: not a git repository: /repo/D:/Milan/opencrm/.git/worktrees/...` and then `no leaks found`, exit 0, because a worktree's `.git` file points outside the mount. A commit made from a worktree would have been "scanned" without scanning anything. This repository is developed through worktrees.
- **Fix:** The Docker branch makes the staged diff on the host (`git diff --cached -U0 --diff-filter=ACMRT`, git failure aborts), keeps only added lines, and pipes them to `gitleaks stdin --redact --no-banner` in the pinned image. Removing a secret is not blocked. The binary branch keeps `gitleaks git --staged` as planned. No volume mount, so no Windows path conversion is needed either.
- **Files modified:** `scripts/scan-staged-secrets.sh`
- **Verification:** `pnpm test:secret-hook`, and real hook runs from the worktree (blocked a token, passed clean commits)
- **Commit:** `b042ee5`

**2. [Rule 1 - Bug] The no-scanner message used `cat`, which does not exist on an empty PATH**
- **Found during:** Task 2 (the third test case failed first, then passed after the fix)
- **Fix:** The message is written with `echo` only (shell built-ins)
- **Files modified:** `scripts/scan-staged-secrets.sh`
- **Commit:** `b042ee5`

**3. [Rule 3 - Blocking] lint-staged does not call `pnpm --dir <app> exec`**
- **Found during:** Task 3
- **Issue:** With the host's pnpm 10.3.0 (which self-switches to the pinned 11.28.5 at the repository root), `pnpm --dir backend exec ...`, `pnpm -C backend ...` and `pnpm exec` inside an app folder all stop with `ERROR packages field missing or empty`, because each app's `pnpm-workspace.yaml` has no `packages` field. The hook would have rejected every commit that touches an app on this machine. (`npx pnpm@11.28.5 --dir backend check` works.)
- **Fix:** `lint-staged.config.mjs` uses function tasks that start `node_modules/eslint/bin/eslint.js` and `node_modules/prettier/bin/prettier.cjs` with `process.execPath`, `cwd` set to the app folder, so each app's own config is read and no pnpm version matters. A missing `node_modules` fails with an instruction to run `pnpm install` in that app. The plan's key link pattern `--dir` therefore does not appear in the config; the intent (each app's own tools run from inside the app) is met.
- **Files modified:** `lint-staged.config.mjs`
- **Commit:** `d492d66`

**4. [Rule 3 - Blocking] `pnpm install --frozen-lockfile` did not run the `prepare` script**
- **Found during:** Task 3
- **Issue:** After adding `"prepare": "husky"` the install printed "Already up to date" and did not run `prepare`, so `core.hooksPath` stayed unset.
- **Fix:** Ran `npx pnpm@11.28.5 run prepare` (which is `husky`). A fresh clone's first `pnpm install` runs it.

### Additions beyond the plan (tests only)

- `test:commitlint` also has a whitespace-only message, a lower-case trailer and an emoji pair (UTF-16 length) and requires each rejection to come from the expected rule.
- `test:secret-hook` has a fourth case (Docker present, daemon unreachable) and requires case 1 to fail because of a real finding.

**Total deviations:** 4 auto-fixed (2 bugs, 2 blocking). **Impact:** none on scope; deviations 1 and 3 change how the hooks are built, not what they enforce.

## Installs run (owner dependency rules)

- Root: `npx pnpm@11.28.5 install --frozen-lockfile` (80 packages, lockfile unchanged).
- `backend/` and `frontend/`: `npx pnpm@11.28.5 install --frozen-lockfile` in each, needed by the Task 3 precondition and lint-staged. Backend's `postinstall` ran `prisma generate` (output is git-ignored). `pnpm --dir backend check` and `pnpm --dir frontend check` fail under the host pnpm 10.3.0 for the reason in deviation 3; `npx pnpm@11.28.5 --dir backend check` passes (frontend is covered by the same pinned-pnpm form per plan 01-06; not re-run here).
- No dependency, version, `pnpm-workspace.yaml` or lockfile changed (`git status` clean after installs).

## For the orchestrator

- `core.hooksPath` is `.husky/_`, written to `D:/Milan/opencrm/.git/config` (`git config --show-origin --get core.hooksPath` prints `file:D:/Milan/opencrm/.git/config  .husky/_`). It is relative, so every working tree resolves it itself; `.husky/_` is generated (git-ignores itself) by `husky`.
- Before committing on `main` after the merge: run `npx pnpm@11.28.5 install --frozen-lockfile` at the root (this runs nothing for `prepare` on an up-to-date tree, so also run `npx pnpm@11.28.5 run prepare` to create `.husky/_`), otherwise `pnpm exec commitlint` has nothing to run and every commit on `main` fails. Commits that touch `backend/` or `frontend/` additionally need each app installed (`--frozen-lockfile`). Docs-only commits do not.
- Every commit needs Docker running (or a gitleaks binary on PATH).
- lint-staged keeps its default backup: for each commit it creates and then drops an entry on the git stash stack (shared by all worktrees), identified by its own hash. I did not run any `git stash` command myself and the stack was empty after my runs.
- The system prompt for this run asked for a `Co-Authored-By` trailer on commits; the project rule and the new hook forbid it, so no commit in this plan carries one.

## Known Stubs

None.

## Threat Flags

None. The threat register items T-08-01 to T-08-05 and T-01-SC are mitigated as planned; T-08-03 (local bypass) is transferred to the CI checks in plan 01-10.

## Next Phase Readiness

Plan 01-10 can import `TYPES` and the `no-ai-attribution` rule from `commitlint.config.mjs` for the pull request title check, and reuse the image tag from `scripts/scan-staged-secrets.sh`. Note that CI cannot reuse the worktree-safe stdin path for a full-history scan; `gitleaks git` with `fetch-depth: 0` is correct there (a normal checkout, not a worktree).

## Self-Check: PASSED
