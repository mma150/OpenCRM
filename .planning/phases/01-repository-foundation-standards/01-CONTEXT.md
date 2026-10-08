# Phase 1: Repository Foundation & Standards - Context

**Gathered:** 2026-10-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers the repository skeleton and the rules every later phase follows: separate `frontend/`, `backend/` and reserved `mobile/` folders; written standards; lint, format and type checks; contributor documents; an enforced commit standard; GitHub Actions CI; security scanning; and a walking skeleton in which the web home page shows live status loaded through the Redux store from a versioned API health endpoint that reads PostgreSQL.

No CRM features, no authentication, no real UI component set (Phase 2). The standards defined here are to be followed unchanged in Phases 2-8.

</domain>

<decisions>
## Implementation Decisions

### Workspace & local setup
- **D-01:** Package manager is pnpm for both apps; contributors enable it through corepack.
- **D-02:** `frontend/` and `backend/` are independent apps, each with its own `package.json` and lockfile. No shared workspace package. The frontend does not import backend code; shared API types come from the generated OpenAPI document.
- **D-03:** One Docker Compose command starts everything for local development: PostgreSQL, the API and the web app all run in containers. The README's "start the full stack" path is this single command. Hot reload must still work inside the containers (source mounted as volumes).
- **D-04:** Node.js is pinned to the current active LTS only (`.nvmrc`, `engines`, CI and the Docker images all use the same version). No multi-version CI matrix.

### Frontend structure & Redux
- **D-05:** Frontend code is organised by feature: `src/features/<feature>/` holds that feature's components, slice, API calls and types. Cross-feature code lives in shared folders (e.g. `src/components`, `src/lib`, `src/store`). — **Reversibility:** costly — every later feature folder follows this layout; changing it means moving files in every module.
- **D-06:** API calls go through Redux Toolkit `createAsyncThunk` with a single shared axios instance. RTK Query is NOT used. Each feature slice handles loading / success / error state explicitly, following one documented pattern, and components use only the typed `useAppDispatch` / `useAppSelector` hooks. — **Reversibility:** costly — every feature's data layer in Phases 2-8 is written to this pattern.
- **D-07:** Next.js App Router (`app/` directory). Route files stay thin and delegate to feature folders.
- **D-08:** Styling standard is Tailwind CSS with shadcn/ui. Phase 1 only installs and configures it and uses it for the skeleton status page; the shared component set is built in Phase 2.

### Backend structure & API
- **D-09:** Backend code is organised by module: `src/modules/<module>/` holds `<module>.routes`, `<module>.controller`, `<module>.service`, `<module>.schema` and its tests. The layering inside a module is routes → controller → service → Prisma data access. Mirrors the frontend feature folders. — **Reversibility:** costly — every later module follows this layout.
- **D-10:** Requests are validated with Zod schemas, and the OpenAPI document is generated from those same schemas so documentation cannot drift from the code. The API serves the versioned OpenAPI document.
- **D-11:** Every API response uses an envelope. Success: `{ data, meta }`. Error: `{ error: { code, message, details } }`. List paging information goes in `meta`. — **Reversibility:** costly — web and the later Flutter client are both written against this shape.
- **D-12:** Every error carries a stable, documented error code (e.g. `VALIDATION_FAILED`, `NOT_FOUND`) alongside its message. Clients switch on the code. The list of codes is part of the written standards.
- **D-13:** Vitest is the test runner on both sides: backend with supertest against a real test database, frontend with Testing Library. Phase 1 ships a sample test for the skeleton on each side so CI's test step is real.

### Commit, branch & CI rules
- **D-14:** Commit format is `type: subject`, e.g. `feat: add lead list`. Allowed types: feat, fix, docs, style, refactor, test, chore, ci, build, perf. Lowercase subject, maximum 72 characters, no body required, scope optional. A local commit hook rejects anything else.
- **D-15:** Commits and pull requests must never contain `Co-Authored-By` or any other AI attribution trailer. Messages stay short.
- **D-16:** Branch model is `main` plus short-lived branches named `feat/...`, `fix/...`, `docs/...`. Pull requests are squash-merged, so `main` gets one commit per PR, and the PR title must follow the commit format (checked in CI).
- **D-17:** Lint is strict with zero warnings allowed: ESLint recommended plus TypeScript strict rules, Prettier formatting, enforced import ordering, no `any`. Warnings fail CI. Staged files are auto-fixed before commit.
- **D-18:** A pull request can merge only when all checks pass (lint, type-check, test and build for the changed app, PR title format, CodeQL, dependency review) and it has one approving review. This is documented as the branch protection rule for `main`.

### Standards docs & naming
- **D-19:** Written standards live in a `docs/` folder: `docs/standards/` with short files (structure, frontend, backend, commits, testing) and `docs/decisions/` for one-page architecture decision records. README and CONTRIBUTING link to them.
- **D-20:** All files are named in kebab-case (`lead-list.tsx`, `leads.service.ts`). React components are PascalCase only as identifiers, not as file names.

### Errors & logging
- **D-21:** The API logs structured JSON with pino: JSON in production, pretty output in development, one line per request, with a request ID that is also returned in the response.

### Security scanning
- **D-22:** Dependabot opens one grouped update pull request per app per week for routine updates; security fixes open immediately on their own.
- **D-23:** Secrets are caught in three places: gitleaks in the pre-commit hook, gitleaks again in CI, and GitHub secret scanning with push protection.
- **D-24:** CI fails a pull request that adds or keeps a high or critical dependency vulnerability. Moderate and low are reported but do not block.

### Environment & secrets
- **D-25:** Environment variables are per app: `frontend/.env` and `backend/.env`, each with a committed `.env.example`. Each app validates its variables with a Zod schema at startup, names the missing or invalid variable, and exits. Docker Compose reads the same files. Real `.env` files are never committed.

### Claude's Discretion
- Exact tool choices not named above: the commit-hook tooling (e.g. husky + commitlint + lint-staged), the Zod-to-OpenAPI library, the HTTP security middleware, the ESLint config packages.
- Exact names and count of the files inside `docs/standards/`, and which Phase 1 choices get an ADR in `docs/decisions/`.
- Contents of the reserved `mobile/` folder (a README placeholder is enough).
- How the frontend derives types from the OpenAPI document (generation tool and where the output lives).
- Issue and pull request template wording, CODE_OF_CONDUCT source text.
- CodeQL schedule timing and Dependabot day of week.
- How the test database is provisioned for backend tests locally and in CI.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs or ADRs exist yet — this phase creates the first ones. Requirements are fully captured in the decisions above and in these planning documents:

### Project planning
- `.planning/PROJECT.md` — project goals, constraints (stack, license, single org, commit rule) and key decisions
- `.planning/REQUIREMENTS.md` — FND-01..08, CTB-01..05, CI-01..02, SEC-01..04 are this phase's requirements
- `.planning/ROADMAP.md` §Phase 1 — goal and the five success criteria, including the walking-skeleton definition
- `.planning/STATE.md` — open concern: GitHub repository settings (Dependabot alerts, secret scanning, CodeQL) must be enabled by the owner; the repo has no remote yet
- `.claude/CLAUDE.md` — commit rules that apply to every agent working in this repo

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None. The repository contains only `.planning/` and `.claude/CLAUDE.md`.

### Established Patterns
- None in code. The five existing commits already follow the `type: subject` format (D-14) and carry no attribution trailers (D-15).

### Integration Points
- Git repository is initialised on `main` with no remote. GitHub-side settings (branch protection, Dependabot alerts, secret scanning, CodeQL enablement) cannot be applied or verified from the local repo; the phase must deliver the configuration files and document the settings the owner has to switch on.

</code_context>

<specifics>
## Specific Ideas

- The owner's stated design goal is "easy to understand and easy to maintain": a contributor should find where a feature lives from folder names alone. Backend modules and frontend features deliberately mirror each other for this reason.
- The owner chose async thunks with axios over RTK Query, and the recommended option was declined. Do not reintroduce RTK Query. Because thunks mean more hand-written code, the standards must give one exact, copyable pattern for a slice (state shape, thunk naming, loading/error handling) so every feature looks the same.
- The owner chose to run the whole stack in Docker Compose, over the recommended database-only setup. First-run simplicity matters more to them than reload speed; the README's main path is the single Compose command.
- The walking-skeleton status page should already demonstrate the full agreed pattern end to end: feature folder → thunk → axios instance → `/api/v1/health` → controller → service → Prisma → PostgreSQL, with the envelope and an error code path.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Repository Foundation & Standards*
*Context gathered: 2026-10-08*
