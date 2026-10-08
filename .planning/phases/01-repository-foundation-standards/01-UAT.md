---
status: testing
phase: 01-repository-foundation-standards
source: [01-VERIFICATION.md]
started: 2026-10-08T13:05:00Z
updated: 2026-10-08T13:05:00Z
---

## Current Test

number: 1
name: Home page shows live status in a real browser
expected: |
  On the running Compose stack, the home page shows status `ok` and a PostgreSQL
  server time (not the "Loading status..." line), Refresh changes the displayed
  time, and the layout is readable at phone, tablet and desktop widths with no
  horizontal scroll.
awaiting: user response

## Tests

### 1. Home page shows live status in a real browser
expected: On the running Compose stack, the home page shows status `ok` and a PostgreSQL server time (not the "Loading status..." line), Refresh changes the displayed time, and the layout is readable at phone, tablet and desktop widths with no horizontal scroll.
result: [pending]

### 2. GitHub Actions run for both apps and the PR-title check works
expected: After pushing `main` to a GitHub remote, `ci` shows the `frontend` and `backend` jobs green. A throwaway pull request titled `Bad title` fails `pr-title`, and passes after the title is edited to `chore: test title check`. A second push to the same ref cancels the in-flight run.
result: [pending]

### 3. Dependabot, CodeQL and secret scanning work on GitHub
expected: After the first push, Insights -> Dependency graph -> Dependabot lists the ecosystems with no config error and opens grouped pull requests. The first CodeQL run appears under Security -> Code scanning for the pull request and for `main`. With push protection on, pushing a made-up credential to a throwaway branch is blocked, and the `gitleaks` job runs and reports the same commit count as the host.
result: [pending]

### 4. The three app folders have no order-dependent behaviour
expected: On a clean checkout, installing and building frontend, backend and root in a different order gives identical results.
result: [pending]

### 5. LICENSE, CONTRIBUTING.md and CODE_OF_CONDUCT.md render on GitHub
expected: The three files render on GitHub and the licence is detected as Apache-2.0.
result: [pending]

### 6. CI jobs, Dependabot, templates and branch rules behave on GitHub
expected: CI jobs finish independently in any order, Dependabot opens no duplicate pull request for an unchanged manifest, the PR and issue templates appear, and branch rules hold under concurrent pull requests (checklist items 6 and 8 in docs/standards/github-settings.md).
result: [pending]

### 7. Owner contact placeholders are filled
expected: `[OWNER TO SET: security contact]` in SECURITY.md and `[OWNER TO SET: conduct contact]` in CODE_OF_CONDUCT.md are replaced with a published contact, the bracketed NOTE in the Contributor Covenant is kept or removed by decision, and `pnpm verify:foundation` prints no WARN lines.
result: [pending]

### 8. Repository settings from the checklist are applied
expected: The settings in docs/standards/github-settings.md are applied (branch protection with the seven checks and one approval, squash-only merging, push protection, private vulnerability reporting, CodeQL default setup off), and its "After the first push" items all pass.
result: [pending]

### 9. Two carried-over owner decisions are made
expected: The Geist font fetched from Google at build time, and the Vite `type: module` warning in frontend tests, are each either accepted or resolved before Phase 2.
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps
