---
phase: 01-repository-foundation-standards
plan: 05
subsystem: api
tags: [express, zod, zod-to-openapi, openapi-3.1, pino, pino-http, helmet, error-envelope, request-id]

requires:
  - phase: 01-repository-foundation-standards
    provides: backend skeleton, lint rules and Vitest harness (plans 01-02, 01-04)
provides:
  - "AppError and the four stable error codes (VALIDATION_FAILED, NOT_FOUND, SERVICE_UNAVAILABLE, INTERNAL_ERROR) mapped centrally to the error envelope"
  - "JSON 404 NOT_FOUND, 400 VALIDATION_FAILED (Zod issues and malformed JSON), 503 SERVICE_UNAVAILABLE for an unreachable database, generic 500 INTERNAL_ERROR with no stack or original text"
  - "X-Request-Id on every response (strict inbound pattern, else randomUUID) and one pino-http JSON log line per request carrying the same id"
  - "helmet baseline headers"
  - "OpenAPI 3.1 document generated from Zod, served at GET /api/v1/openapi.json and committed at backend/openapi/openapi.json, with a drift test"
affects: [01-07, 01-09, 01-10, phase-02]

actuals:
  tokens: 9500
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Controllers call schema.parse; a ZodError is mapped centrally to VALIDATION_FAILED; no request-rewriting middleware"
    - "Route files register the Express route and the OpenAPI path side by side (registry.registerPath)"
    - "lib/openapi.ts is the only caller of extendZodWithOpenApi; schema files import z from it"
    - "5xx errors are attached to res.err so pino-http writes the full error on the request's single log line, never in the body"
    - "scripts/generate-openapi.ts loads backend/.env.example (never overriding set variables) before a dynamic import of the routes"

key-files:
  created:
    - backend/src/lib/app-error.ts
    - backend/src/lib/logger.ts
    - backend/src/lib/openapi.ts
    - backend/src/lib/openapi.test.ts
    - backend/src/middleware/not-found.ts
    - backend/src/middleware/error-handler.test.ts
    - backend/src/modules/health/health.schema.ts
    - backend/src/routes.ts
    - backend/scripts/generate-openapi.ts
    - backend/openapi/openapi.json
  modified:
    - backend/src/middleware/error-handler.ts
    - backend/src/modules/health/health.service.ts
    - backend/src/modules/health/health.controller.ts
    - backend/src/modules/health/health.routes.ts
    - backend/src/modules/health/health.test.ts
    - backend/src/app.ts

key-decisions:
  - "details is always present in an error body and typed in OpenAPI as null, a list of ValidationDetail, or an object, so generated clients get a required key"
  - "Unmatched route message is 'Route not found'; the 503 message is exactly 'Database is unavailable'; the 500 message is 'Internal server error'"
  - "AppError takes an optional fifth ErrorOptions argument so the health service can keep the original database error as cause, which is logged but never sent"
  - "createHttpLogger(options) is exported next to httpLogger so tests can capture log output and prove redaction and one-line-per-request"
  - "generate-openapi.ts needs no process.env read: process.loadEnvFile never overrides set variables, so loading .env.example unconditionally is enough"

patterns-established:
  - "Test-only route app inside a test file (express + httpLogger + json + notFound + errorHandler) to exercise middleware paths a public route does not reach"
  - "Drift check is a Vitest test (parsed and byte comparison of the committed file with buildOpenApiDocument()), run by pnpm test and so by CI"

requirements-completed: [FND-06, FND-07]

coverage:
  - id: D1
    description: "Every error response is { error: { code, message, details } } with a stable code; unknown route -> 404 NOT_FOUND, bad input -> 400 VALIDATION_FAILED with { path, message } details, malformed JSON -> 400 VALIDATION_FAILED, AppError keeps its status and code"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "backend/src/middleware/error-handler.test.ts#not found, validation, error mapping"
        status: pass
    human_judgment: false
  - id: D2
    description: "Unknown errors return 500 INTERNAL_ERROR with a generic message; the body has no stack and no original error text, while the full error is in the log line"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "backend/src/middleware/error-handler.test.ts#maps any other error to 500 INTERNAL_ERROR / logs a failed request once"
        status: pass
    human_judgment: false
  - id: D3
    description: "An unreachable database returns 503 SERVICE_UNAVAILABLE from GET /api/v1/health (Prisma query rejected through a Vitest spy)"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "backend/src/modules/health/health.test.ts#returns 503 SERVICE_UNAVAILABLE"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every response carries X-Request-Id; a well-formed inbound id is echoed, a malformed one replaced; parallel requests get different ids and one failing request does not change another"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "backend/src/middleware/error-handler.test.ts#request id"
        status: pass
      - kind: command
        ref: "curl -sI http://localhost:4010/api/v1/health -> x-request-id and x-content-type-options: nosniff; docker compose logs api shows the same id on the 'request completed' entry"
        status: pass
    human_judgment: false
  - id: D5
    description: "One structured log entry per request with the request id; authorization and cookie headers are redacted and request bodies are not logged"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "backend/src/middleware/error-handler.test.ts#request logging"
        status: pass
    human_judgment: false
  - id: D6
    description: "GET /api/v1/openapi.json returns OpenAPI 3.1.0 listing /health (200 envelope with Health, 503 ErrorResponse) and the Health, ErrorResponse, ErrorCode components; ErrorCode equals ERROR_CODES"
    requirement: FND-07
    verification:
      - kind: integration
        ref: "backend/src/lib/openapi.test.ts#GET /api/v1/openapi.json, OpenAPI document content"
        status: pass
      - kind: command
        ref: "curl -fsS http://localhost:4010/api/v1/openapi.json deep-equals backend/openapi/openapi.json"
        status: pass
    human_judgment: false
  - id: D7
    description: "pnpm openapi:generate is byte-identical on repeat and the drift test fails when the committed file differs from the generated document"
    requirement: FND-07
    verification:
      - kind: command
        ref: "generate twice -> identical sha256; edited committed file -> 2 failing tests; restored -> passing; generate then git diff --exit-code -> 0"
        status: pass
    human_judgment: false
---

# Phase 1 Plan 05: Error Envelope, Request Logging and OpenAPI Summary

**A central error path maps Zod, malformed JSON, AppError, unreachable-database and unknown failures to four stable codes in the `{ error: { code, message, details } }` envelope, every request gets an `X-Request-Id` and one pino log entry, and an OpenAPI 3.1 document generated from the Zod schemas is served at `/api/v1/openapi.json` and committed with a drift test.**

## Performance

- **Duration:** about 35 min
- **Completed:** 2026-10-08
- **Tasks:** 2
- **Files:** 10 created, 6 modified

## Accomplishments

- Unknown routes, invalid input, malformed JSON, an unreachable database and unexpected failures each return the documented envelope; the 500 body contains no stack and none of the thrown text (the test throws `secret internal detail at /srv/app/lead.service.ts` and asserts none of it, nor `at `, nor `stack`, appears in the response).
- Request ids: inbound `^[A-Za-z0-9._-]{8,64}$` values are echoed, anything else (too short, 65 characters, spaces and angle brackets) is replaced by a UUID. Three parallel requests (two ok, one failing) got distinct ids and kept their own statuses (200, 200, 500).
- Logging: one JSON line per request (pino-pretty only when `NODE_ENV=development`, silent in test). Captured-stream tests show exactly one line per request, the request id on it, `authorization` and `cookie` values absent, a request body marker absent, and for a failed request the full error text present in the log but not in the response.
- OpenAPI: `GET /api/v1/openapi.json` returns the bare 3.1.0 document; the committed `backend/openapi/openapi.json` is identical to it. Generating twice gives the same sha256 (`7dd5bc27...e92df`).
- Live in Compose (`API_PORT=4010 DB_PORT=5440 WEB_PORT=3010`): `/api/v1/nope` -> 404 `{"error":{"code":"NOT_FOUND",...}}`; a malformed JSON POST -> 400 `VALIDATION_FAILED`; `curl -sI /api/v1/health` shows `X-Request-Id` and `X-Content-Type-Options: nosniff`; the same id appears on the `request completed` entry in `docker compose logs api`; with an `Origin` of the web port the response carries `Access-Control-Allow-Origin` and `Access-Control-Expose-Headers: X-Request-Id`.
- Full stack: `docker compose up -d --wait` brought `db`, `api` and `web` to healthy and the web home page returned 200 and contained the status component.

## Verification results

| Command | Result |
| --- | --- |
| `pnpm --dir backend test` (host, `DATABASE_URL` exported for port 5440) | 4 files, 36 tests, all pass |
| `pnpm --dir backend check` | exit 0 (eslint zero warnings, prettier, tsc) |
| `pnpm --dir backend build` | success, `dist/server.js` 10.04 KB |
| `pnpm --dir backend audit --audit-level=high` | exit 0 (1 low, same as before) |
| `pnpm --dir backend openapi:generate` twice | identical sha256 |
| `openapi:generate` then `git diff --exit-code -- backend/openapi/openapi.json` | exit 0 |
| `extendZodWithOpenApi` outside `lib/openapi.ts` | no matches |
| Drift negative proof: change `info.title` in the committed JSON, run `openapi.test.ts` | 2 failed ("matches the document the code generates (drift check)" and "is byte-identical to the generator output formatting"), 7 passed; file restored, 9 passed |

TDD red step: with the tests written and no implementation, `error-handler.test.ts` could not load (missing modules) and the health tests for 503 and the request id failed (`expected 500 to be 503`); they passed after the implementation.

## Final error code table (for plan 01-09)

| Code | HTTP | When | Message |
| --- | --- | --- | --- |
| VALIDATION_FAILED | 400 | ZodError from a controller parse (details: list of `{ path, message }`), or a malformed JSON body (details: null) | "Request validation failed" / "Request body is not valid JSON" |
| NOT_FOUND | 404 | No route matched | "Route not found" |
| SERVICE_UNAVAILABLE | 503 | The database cannot be reached | "Database is unavailable" |
| INTERNAL_ERROR | 500 | Anything else | "Internal server error" |

Error body: `{ "error": { "code", "message", "details" } }`, exactly these keys, `details` always present. Response header `X-Request-Id` on every response. Other body-parser failures (for example an oversized body) are not mapped specially and currently become 500 INTERNAL_ERROR; add a code if a later phase needs 413.

## Assumptions to document in plan 01-09 (from the plan, unchanged)

1. Open question 7: the health route takes no input, so request validation is proven by a test-only route inside `error-handler.test.ts` that uses the same `schema.parse` call and `errorHandler`; no validated parameter was added to the public health route.
2. `GET /api/v1/openapi.json` returns the raw OpenAPI document, not wrapped in `{ data, meta }`; this is the one documented exception to D-11.
3. `SERVICE_UNAVAILABLE` and `INTERNAL_ERROR` are research proposals (A4); renaming them after Phase 2 clients exist means changing every client.

## Task Commits

1. **Task 1: Error codes, central error and validation path, request logging with request ids** - `18620f5` (feat)
2. **Task 2: OpenAPI document generated from Zod, served at /api/v1/openapi.json and committed** - `8c05a71` (feat)

**Plan metadata:** the docs(01-05) commit that follows.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] `details` made a required, typed key in the OpenAPI error schema**
- **Found during:** Task 2 (first generated document)
- **Issue:** Modelling `details` as `z.unknown()` made the generator mark it optional, although the API always sends it; generated clients would type a key the contract guarantees as possibly missing.
- **Fix:** `details` is a union of null, a list of the registered `ValidationDetail` component, and an object. This adds one component (`ValidationDetail`) beyond the three the plan names. A test asserts `code`, `message`, `details` are all required.
- **Files modified:** `backend/src/lib/openapi.ts`, `backend/src/lib/openapi.test.ts`
- **Commit:** `8c05a71`

### Choices inside plan latitude (not deviations)

- `AppError` has an optional fifth argument (`ErrorOptions`) so `health.service.ts` keeps the database error as `cause` for the log; the plan's four-argument signature still works.
- `createHttpLogger({ destination, level })` is exported next to `httpLogger` so the redaction and one-line-per-request claims are tested, not assumed.
- The generate script does not read `process.env`: `process.loadEnvFile` skips variables that are already set, so loading `.env.example` unconditionally gives the "only when DATABASE_URL is unset" behaviour without needing a fourth `process.env` exception in ESLint.
- `docker compose logs api` in development shows pino-pretty, where one request is a multi-line entry (one `request completed` block with the id); JSON appears outside development.

**Total deviations:** 1 auto-fixed (Rule 2), 0 architectural. No dependency, manifest or lockfile change (`pnpm install --frozen-lockfile` left the tree clean).

## Issues Encountered

- Host Node 25.6.0 prints the expected `Unsupported engine` warning; host pnpm is 10.3.0 so every command ran as `npx pnpm@11.28.5`.
- The Git Bash sandbox refused chained commands containing git; those were split into separate calls. A `curl -o /tmp/...` wrote to a different `/tmp` than Node read on Windows; the comparison was redone through the session scratchpad directory.
- Helmet's default `Cross-Origin-Resource-Policy: same-origin` is present on API responses. CORP is only enforced for no-cors requests, and the web app calls the API in CORS mode (a cross-origin response with `Access-Control-Allow-Origin` was confirmed with curl), but a real browser load of the web status component was not driven in this plan; the end-of-phase check should confirm it.

## Threat Surface

T-05-01 (no stack or original text in the 500 body, tested), T-05-02 (strict request-id pattern, tested), T-05-03 (redact authorization and cookie, bodies not logged, tested), T-05-04 (Zod parse mapped centrally, tested through the test-only route), T-05-05 (helmet defaults; `X-Content-Type-Options: nosniff` confirmed live), T-05-07 (one entry per request with the returned id). T-05-06 accepted as planned. The default pino-http serializer still logs request headers other than the two redacted ones (user agent, origin and similar); revisit when authentication adds more headers in Phase 2. No new threat flags.

## Known Stubs

None.

## User Setup Required

None. To run the tests on the host: `docker compose up -d --wait db`, then `pnpm --dir backend test` (export `DATABASE_URL` if the database is published on a non-default port). To refresh the contract after changing a route or schema: `pnpm --dir backend openapi:generate` and commit `backend/openapi/openapi.json`; the drift test fails until you do.

## Next Phase Readiness

- Plan 01-07 can run `openapi-typescript ../backend/openapi/openapi.json` against the committed document.
- Plan 01-09 documents the error code table, the request-id rule, the raw-document exception and the register-beside-the-route convention.
- Plan 01-10 CI already gets the drift check through `pnpm --dir backend test`; an explicit `openapi:generate` plus `git diff --exit-code` step also works.
- Stack stopped with `docker compose down` (no `-v`); volumes remain. Nothing left running, nothing untracked in the worktree (`backend/node_modules`, `backend/dist` and the generated Prisma client are gitignored).

---
*Phase: 01-repository-foundation-standards*
*Completed: 2026-10-08*

## Self-Check: PASSED

All ten created files exist on disk, commits `18620f5` and `8c05a71` are in `git log`, and `test`, `check`, `build`, `audit`, the double generate with `git diff --exit-code`, the drift negative proof and the live Compose requests were run against the final committed state.
