---
phase: 01-repository-foundation-standards
plan: 09
subsystem: docs
tags: [standards, contributing, licence, code-of-conduct, adr, readme]
status: complete

requires:
  - phase: 01-repository-foundation-standards
    provides: the skeleton code the standards describe (plans 01-02 to 01-07) and the owner answers recorded in 01-01
provides:
  - "docs/standards/structure.md, backend.md, frontend.md, testing.md describing what the code does today, each naming the lint rule or test that enforces each rule"
  - "docs/decisions/0001 to 0004 one-page records (Node pin, root tooling package, thunks with axios, all-in-Docker development)"
  - "LICENSE (unmodified Apache-2.0), CODE_OF_CONDUCT.md (Contributor Covenant 3.0 with one owner-input token), CONTRIBUTING.md"
  - "mobile/README.md as the only tracked file under mobile/"
  - "README Documentation, Development and Licence sections"
affects: [01-08, 01-10, phase-02]

actuals:
  tokens: 20000
  tasks: 3
  commits: 3

key-files:
  created:
    - LICENSE
    - CODE_OF_CONDUCT.md
    - CONTRIBUTING.md
    - mobile/README.md
    - docs/standards/structure.md
    - docs/standards/backend.md
    - docs/standards/frontend.md
    - docs/standards/testing.md
    - docs/decisions/0001-node-lts-pin.md
    - docs/decisions/0002-root-tooling-package.md
    - docs/decisions/0003-async-thunks-with-axios.md
    - docs/decisions/0004-all-in-docker-development.md
  modified:
    - README.md

key-decisions:
  - "ADR 0001 and 0002 Status lines use the owner's recorded answers (A2 and A1, 2026-10-08), so both read 'Accepted by the owner on 2026-10-08'"
  - "The Node major is documented as written in .nvmrc, three engines fields and two NODE_VERSION build args in compose.yaml (not 'one place'), because that is what the repository contains"
  - "The second NOTE in the Contributor Covenant (enforcement ladder suggestions) was left as published; only the designated reporting slot was replaced"
  - "CONTRIBUTING and README describe the commit hook and CI checks by pointing at commits.md and github-settings.md without saying a hook or workflow is already active"

requirements-completed: [FND-01, FND-02, FND-04, FND-05, FND-06, CTB-01, CTB-05]

coverage:
  - id: D1
    description: "LICENSE is byte-identical to the official Apache-2.0 text"
    requirement: CTB-01
    verification:
      - kind: command
        ref: "curl -fsSL https://www.apache.org/licenses/LICENSE-2.0.txt | tr -d '\\r' | diff -q - LICENSE -> identical; sha256 cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30 for the download, the file and git show HEAD:LICENSE"
        status: pass
    human_judgment: false
  - id: D2
    description: "CODE_OF_CONDUCT.md is the official Contributor Covenant 3.0 text with only the reporting slot replaced by [OWNER TO SET: conduct contact]; no email address in any file written"
    requirement: CTB-01
    verification:
      - kind: command
        ref: "diff of the download against CODE_OF_CONDUCT.md shows a single changed line (50); grep for an email pattern over all new and edited files finds nothing"
        status: pass
    human_judgment: false
  - id: D3
    description: "CONTRIBUTING.md has the required headings and documents branch prefixes, squash merge, the PR title rule, required checks and one approving review"
    requirement: CTB-05
    verification:
      - kind: command
        ref: "Task 1 verify greps (Contributor Covenant, token, '## Branches and pull requests'); git ls-files mobile prints exactly mobile/README.md"
        status: pass
    human_judgment: false
  - id: D4
    description: "The four standards documents exist, contain the required terms, and every repository path they cite exists (except hypothetical examples and gitignored output)"
    requirement: FND-02
    verification:
      - kind: command
        ref: "Task 2 verify greps; link check over all docs; backticked backend/ and frontend/ paths checked with test -e"
        status: pass
    human_judgment: false
  - id: D5
    description: "Four decision records with Status, Context, Decision, Consequences; README keeps Quick start and Repository layout and links every standards document, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY and LICENSE"
    requirement: FND-04
    verification:
      - kind: command
        ref: "Task 3 verify greps"
        status: pass
    human_judgment: false
  - id: D6
    description: "The statements in the standards match the code at runtime (commands run, not just read)"
    requirement: FND-02
    verification: []
    human_judgment: true
    rationale: "This plan is documentation and ran no application command. Statements were checked by reading the source; none of the documented commands were executed here (see Statements not confirmed)."

duration: n/a
completed: 2026-10-08
---

# Phase 1 Plan 09: Standards, Decision Records and Contributor Documents Summary

**Four standards documents that describe what the walking skeleton actually does and name the lint rule or test enforcing each rule, four one-page decision records, the unmodified Apache-2.0 LICENSE, the Contributor Covenant 3.0 with an owner-input contact token, a CONTRIBUTING guide with the branch and pull request rules, a reserved `mobile/` folder, and README links to all of it.**

## Accomplishments

- `docs/standards/structure.md`: top-level layout, both trees as they exist, the mirror rule, kebab-case naming (enforced by `unicorn/filename-case`), an "Adding a feature" checklist for backend and frontend, and where configuration lives.
- `docs/standards/backend.md`: module file roles, the import rules with their enforcement, validation (central ZodError mapping), both envelope shapes with real responses, the four error codes with HTTP status (equal to `ERROR_CODES`) and how to add one, OpenAPI generation and the drift test, the raw-document exception, logging and request ids, the env module, Prisma commands in the container and how Phase 2 creates the first migration.
- `docs/standards/frontend.md`: the six-step slice recipe with code copied from the health feature, state shape, thunk naming, the loading `condition`, `ApiError` and its client codes (`NETWORK_ERROR`, `TIMEOUT`, `UNKNOWN_ERROR`), typed hooks only, one axios instance, no RTK Query, switching on error codes, generating API types, Tailwind and shadcn, the env module, and a rule-to-enforcement table.
- `docs/standards/testing.md`: Vitest on both sides, supertest against the auto-provisioned `opencrm_test` database, Testing Library with mocking at the feature API file, what each new module and feature must test, commands, no lint disabling.
- Decision records 0001 to 0004, with the Status lines taken from the owner's 2026-10-08 answers.
- LICENSE, CODE_OF_CONDUCT.md, CONTRIBUTING.md and `mobile/README.md` (the only file under `mobile/`).
- README gained Documentation, Development and Licence sections; the existing Quick start and Repository layout are kept (the `mobile/` line no longer says "not created yet", and a `docs/` line was added).

## Provenance of the two third-party texts

- **LICENSE:** downloaded from https://www.apache.org/licenses/LICENSE-2.0.txt (11,358 bytes, ASCII, no CR). sha256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` for the download, the working file and `git show HEAD:LICENSE`. A second, separate download piped through `tr -d '\r' | diff -q - LICENSE` reported identical. The appendix copyright line was not filled in.
- **CODE_OF_CONDUCT.md:** downloaded from https://www.contributor-covenant.org/version/3/0/code_of_conduct/code_of_conduct.md (8,778 bytes, no CR; sha256 of the download `ed3f8089262ea04de59d089a267bfa0822b93c96ac5a65d0647fd767a25c8422`). Produced with a single `sed` substitution of `[NOTE: describe your means of reporting here.]` by `[OWNER TO SET: conduct contact]`. `diff` against the download shows exactly one changed line (line 50). The attribution section is intact.

## Task Commits

1. **Task 1: LICENSE, CODE_OF_CONDUCT, CONTRIBUTING and the reserved mobile folder** - `d12e0db` (docs)
2. **Task 2: Standards documents for structure, backend, frontend and testing** - `fa28e36` (docs)
3. **Task 3: Decision records and README documentation links** - `f8f1b04` (docs)

## Owner-input tokens left in the documents

- `[OWNER TO SET: conduct contact]` in `CODE_OF_CONDUCT.md` (line 50). The owner must decide which contact method to publish.
- The published Covenant text also contains a second bracketed `[NOTE: The remedies and repairs outlined below are suggestions ... edit this section ...]` before the enforcement ladder. It is part of the official text and was left unaltered under the "no change beyond the designated placeholder" rule. The owner may want to delete that note and decide whether the ladder suits the project.

## Dangling links until later plans merge

All of these are written as links on purpose (the plan says to link now). They resolve once the named plan merges:

- `docs/standards/commits.md`: plan 01-08. Linked from README.md and CONTRIBUTING.md.
- `docs/standards/github-settings.md`, `docs/standards/security.md` and `SECURITY.md`: plan 01-10. Linked from README.md and CONTRIBUTING.md.

`.github/` and `scripts/` are named in `structure.md` (top-level layout) but do not exist yet; they come from plans 01-08 and 01-10. No other link in the new documents is broken (checked with a script over README, CONTRIBUTING, mobile/README and all of docs).

## Statements not confirmed against the code or a run

These are in the documents and were not confirmed:

1. **corepack fallbacks in CONTRIBUTING** (`npm install -g corepack`, elevated shell on Windows, `npm install -g pnpm@11.28.5`): taken from research Pitfall 12, marked there as assumed; not run (this plan ran no install).
2. **`docker compose exec api pnpm exec prisma migrate dev --name <name>`** as the way Phase 2 creates the first migration: the standard Prisma command, not run because the schema has no models. The doc says so.
3. **`shadcn add` guidance** (frontend.md, Styling): the advice to use the locally installed tool and review package.json and lockfile diffs rests on what plan 01-07 did for `shadcn init`; `shadcn add` itself was never run.
4. **CI behaviour** (backend.md, testing.md, CONTRIBUTING): the drift test being caught "by CI", CI providing a PostgreSQL service and reading `.nvmrc`, and the list of required checks describe the intent of D-18 and plan 01-10, which has not run yet. No workflow exists in the repository.
5. **Commit hook behaviour:** CONTRIBUTING says the commit rules are in `commits.md`; it does not claim a hook is active, but the root `package.json` already declares scripts (`test:commitlint`, `test:secret-hook`, `verify:foundation`) whose files do not exist yet.
6. **ADR 0004 timings** are copied from the plan 01-02, 01-03 and research measurements (84 to 113 s, 179 to 187 s, about 15 s, 8 to 12 s); not re-measured.
7. **ADR 0001** dates and the Prisma recommendation are copied from the research (Node release schedule read on 2026-10-08); not re-fetched.
8. **Commands in the tables** (`check`, `test`, `build`, `run audit`, `openapi:generate`, `api:types`) were read from `package.json`, and `check`, `test`, `build`, `audit`, `openapi:generate` and `api:types` were run by earlier plans per their summaries. They were not re-run here; this plan used no Docker or installs.

## Deviations from Plan

None - plan executed as written, with these small judgment calls recorded for transparency:

- **README:** the `mobile/` line in the existing Repository layout said "(not created yet)"; it now says "a README only, no code yet" and a `docs/` line was added. The plan asks to keep existing sections, which were kept.
- **ADR 0001 wording:** the plan describes the Node pin as "in one place". The repository has it in `.nvmrc`, three `engines` fields and two `NODE_VERSION` args in `compose.yaml`; the record lists them all rather than claim one place.
- **Audit command in the tables:** `pnpm --dir <app> run audit` (not `pnpm audit`), because the bare form is pnpm's built-in command and would skip the `--audit-level=high` in the script.
- **Verification run:** all three task verify commands passed. The Task 1 verify's `git ls-files mobile` check was run after the commit, as it needs tracked files.

## Known Stubs

None. The only placeholder is the intentional owner-input token above.

## Threat Surface

T-09-01: no email address or personal name appears in any file written (regex scan over README, CONTRIBUTING, CODE_OF_CONDUCT, mobile and docs found none; a grep for the developer's name and domain found none). T-09-02: LICENSE and covenant checked as described above. T-09-03: cited file paths were checked with `test -e`; the code list in backend.md equals `ERROR_CODES` by reading both. No new threat flags.

## Needs a human

- Decide and set the conduct contact in `CODE_OF_CONDUCT.md`, and decide about the second NOTE in the Covenant.
- Review the documents for tone and for anything you want to state differently; they were written for a TypeScript developer new to this repo.

## Next Phase Readiness

- Plan 01-08 must create `docs/standards/commits.md` at exactly that path (README and CONTRIBUTING link to it).
- Plan 01-10 must create `SECURITY.md`, `docs/standards/github-settings.md` and `docs/standards/security.md` at those paths, and its verifier can compare the error-code table in `docs/standards/backend.md` with `ERROR_CODES`.
- If plan 01-08 or 01-10 changes a command or a path that the documents mention (hook behaviour, CI check names), update `CONTRIBUTING.md` and `docs/standards/` in the same pull request.

---
*Phase: 01-repository-foundation-standards*
*Completed: 2026-10-08*

## Self-Check: PASSED

All twelve new files and the modified README exist; commits `d12e0db`, `fa28e36` and `f8f1b04` are in `git log`; the three task verify commands, the link check and the email scan were run against the committed content.
