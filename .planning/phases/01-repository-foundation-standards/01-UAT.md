---
status: complete
phase: 01-repository-foundation-standards
source: [01-VERIFICATION.md]
started: 2026-10-08T13:05:00Z
updated: 2026-10-08T13:15:21.184Z
---

## Current Test

[testing complete]

## Tests

### 1. Home page shows live status in a real browser
expected: On the running Compose stack, the home page shows status `ok` and a PostgreSQL server time (not the "Loading status..." line), Refresh changes the displayed time, and the layout is readable at phone, tablet and desktop widths with no horizontal scroll.
result: pass

### 2. GitHub Actions run for both apps and the PR-title check works
expected: After pushing `main` to a GitHub remote, `ci` shows the `frontend` and `backend` jobs green. A throwaway pull request titled `Bad title` fails `pr-title`, and passes after the title is edited to `chore: test title check`. A second push to the same ref cancels the in-flight run.
result: skipped
reason: "Deferred follow-up: no need git repo"

### 3. Dependabot, CodeQL and secret scanning work on GitHub
expected: After the first push, Insights -> Dependency graph -> Dependabot lists the ecosystems with no config error and opens grouped pull requests. The first CodeQL run appears under Security -> Code scanning for the pull request and for `main`. With push protection on, pushing a made-up credential to a throwaway branch is blocked, and the `gitleaks` job runs and reports the same commit count as the host.
result: skipped
reason: "Deferred follow-up: no need git repo"

### 4. The three app folders have no order-dependent behaviour
expected: On a clean checkout, installing and building frontend, backend and root in a different order gives identical results.
result: pass

### 5. LICENSE, CONTRIBUTING.md and CODE_OF_CONDUCT.md render on GitHub
expected: The three files render on GitHub and the licence is detected as Apache-2.0.
result: skipped
reason: "Deferred follow-up: no need git repo"

### 6. CI jobs, Dependabot, templates and branch rules behave on GitHub
expected: CI jobs finish independently in any order, Dependabot opens no duplicate pull request for an unchanged manifest, the PR and issue templates appear, and branch rules hold under concurrent pull requests (checklist items 6 and 8 in docs/standards/github-settings.md).
result: skipped
reason: "Deferred follow-up: no need git repo"

### 7. Owner contact placeholders are filled
expected: `[OWNER TO SET: security contact]` in SECURITY.md and `[OWNER TO SET: conduct contact]` in CODE_OF_CONDUCT.md are replaced with a published contact, the bracketed NOTE in the Contributor Covenant is kept or removed by decision, and `pnpm verify:foundation` prints no WARN lines.
result: skipped
reason: "Deferred follow-up: Owner accepted this item without filling the contacts; both placeholders are still in SECURITY.md and CODE_OF_CONDUCT.md and must be filled before the repository is made public"

### 8. Repository settings from the checklist are applied
expected: The settings in docs/standards/github-settings.md are applied (branch protection with the seven checks and one approval, squash-only merging, push protection, private vulnerability reporting, CodeQL default setup off), and its "After the first push" items all pass.
result: skipped
reason: "Deferred follow-up: no need git repo"

### 9. Two carried-over owner decisions are made
expected: The Geist font fetched from Google at build time, and the Vite `type: module` warning in frontend tests, are each either accepted or resolved before Phase 2.
result: pass

## Summary

total: 9
passed: 3
issues: 0
pending: 0
skipped: 6
blocked: 0

## Gaps

## Deferred Follow-Ups

- test: 2
  idea: "no need git repo"
  deferred_at: 2026-10-08
- test: 3
  idea: "no need git repo"
  deferred_at: 2026-10-08
- test: 5
  idea: "no need git repo"
  deferred_at: 2026-10-08
- test: 6
  idea: "no need git repo"
  deferred_at: 2026-10-08
- test: 7
  idea: "Owner accepted this item without filling the contacts; both placeholders are still in SECURITY.md and CODE_OF_CONDUCT.md and must be filled before the repository is made public"
  deferred_at: 2026-10-08
- test: 8
  idea: "no need git repo"
  deferred_at: 2026-10-08
