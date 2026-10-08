# Phase 1: Repository Foundation & Standards - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-08
**Phase:** 01-repository-foundation-standards
**Areas discussed:** Workspace & local setup, Frontend structure & Redux, Backend structure & API, Commit branch & CI rules, Standards docs & naming, Errors & logging, Security scanning detail, Env & secrets

---

## Workspace & local setup

| Question | Options | Selected |
|----------|---------|----------|
| Package manager | pnpm (Recommended) / npm / You decide | pnpm |
| How frontend/ and backend/ relate | Independent apps (Recommended) / One workspace / You decide | Independent apps |
| Local PostgreSQL | Docker Compose for DB (Recommended) / Compose for everything / Install it yourself | Compose for everything |
| Node version | Current LTS (Recommended) / LTS + previous LTS | Current LTS |

**Notes:** The owner picked "Compose for everything" over the recommended database-only Compose.

---

## Frontend structure & Redux

| Question | Options | Selected |
|----------|---------|----------|
| Folder organisation | By feature (Recommended) / By type | By feature |
| API calls through Redux | RTK Query (Recommended) / Async thunks + axios / Both, by rule | Async thunks + axios |
| Next.js routing | App Router (Recommended) / Pages Router | App Router |
| Styling | Tailwind + shadcn/ui (Recommended) / MUI / Decide in Phase 2 | Tailwind + shadcn/ui |

**Notes:** The owner picked async thunks + axios over the recommended RTK Query.

---

## Backend structure & API

| Question | Options | Selected |
|----------|---------|----------|
| Folder organisation | By module (Recommended) / By layer | By module |
| Validation and OpenAPI | Zod, OpenAPI generated (Recommended) / Hand-written OpenAPI / You decide | Zod, OpenAPI generated |
| Response shape | Envelope (Recommended) / Plain resources | Envelope |
| Testing baseline | Vitest both sides (Recommended) / Jest both sides / Add Playwright too | Vitest both sides |

---

## Commit, branch & CI rules

| Question | Options | Selected |
|----------|---------|----------|
| Commit format | type: subject (Recommended) / type(scope): subject | type: subject |
| Branch and merge model | main + short branches (Recommended) / main + develop | main + short branches |
| Lint strictness | Strict, zero warnings (Recommended) / Recommended presets only | Strict, zero warnings |
| Merge gates | All checks + 1 review (Recommended) / All checks, no review / Add coverage threshold | All checks + 1 review |

---

## Standards docs & naming

| Question | Options | Selected |
|----------|---------|----------|
| Where standards live | docs/ folder (Recommended) / Single STANDARDS.md | docs/ folder |
| File naming | kebab-case files (Recommended) / PascalCase components | kebab-case files |

---

## Errors & logging

| Question | Options | Selected |
|----------|---------|----------|
| API logging | Structured JSON (Recommended) / Simple console logs | Structured JSON |
| Error identification | Stable error codes (Recommended) / HTTP status + message | Stable error codes |

---

## Security scanning detail

| Question | Options | Selected |
|----------|---------|----------|
| Dependabot cadence | Weekly, grouped (Recommended) / Daily, individual / Security only | Weekly, grouped |
| Secret scanning location | Hook + CI + GitHub (Recommended) / CI + GitHub only | Hook + CI + GitHub |
| Severity that fails CI | High and critical (Recommended) / Moderate and above / Report only | High and critical |

---

## Env & secrets

| Question | Options | Selected |
|----------|---------|----------|
| Env file layout | Per-app .env (Recommended) / Single root .env | Per-app .env |

---

## Claude's Discretion

- Commit-hook tooling, Zod-to-OpenAPI library, security middleware, ESLint config packages
- File names inside docs/standards/ and which choices get an ADR
- Contents of the reserved mobile/ folder
- How the frontend generates types from the OpenAPI document
- Template wording, CODE_OF_CONDUCT source, CodeQL and Dependabot timing
- Test database provisioning

## Deferred Ideas

None.
