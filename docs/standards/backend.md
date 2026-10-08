# Backend standard

How the API in `backend/` is built: module layout, layering, validation, the response envelope, error codes, OpenAPI, logging, environment and Prisma. The working example is the health module, [`backend/src/modules/health/`](../../backend/src/modules/health/). Each rule below says what enforces it: an ESLint rule, a test, or (where nothing automatic exists) code review.

Related: [structure](structure.md), [testing](testing.md), [frontend](frontend.md).

## Request path

```text
request -> httpLogger -> helmet -> cors -> express.json -> /api/v1 routes
        -> routes -> controller -> service -> Prisma -> PostgreSQL
unmatched route -> notFound (NOT_FOUND)   any thrown error -> errorHandler (error envelope)
```

The order is set in [`backend/src/app.ts`](../../backend/src/app.ts): the logger comes first so every response, including errors, has a request id. Every module router is mounted in [`backend/src/routes.ts`](../../backend/src/routes.ts), and the whole API lives under `/api/v1`.

## Module layout (D-09)

One folder per module in `backend/src/modules/<module>/`, with exactly these files:

| File | Role |
| --- | --- |
| `<module>.routes.ts` | The Express router **and** the OpenAPI description of its paths, side by side. |
| `<module>.controller.ts` | Reads the request, validates it with Zod, calls the service, sends the envelope. |
| `<module>.service.ts` | Business rules and Prisma calls. Returns plain data. |
| `<module>.schema.ts` | Zod schemas for input and output. |
| `<module>.test.ts` | supertest tests (see [testing](testing.md)). |

## Import rules

The layering is routes, then controller, then service, then Prisma.

| Rule | Enforced by |
| --- | --- |
| Routes never import a service; they go through the controller. | ESLint `no-restricted-imports` on `**/*.routes.ts` in [`backend/eslint.config.mjs`](../../backend/eslint.config.mjs) |
| Controllers never import Prisma (`lib/prisma` or `generated/prisma`). | ESLint `no-restricted-imports` on `**/*.controller.ts` |
| Nothing outside `src/env.ts`, `prisma.config.ts` and `test/global-setup.ts` reads `process.env`. | ESLint `no-restricted-properties` |
| Services never touch `req` or `res`; they take plain arguments and return plain data. | Code review (a service that imports Express types is wrong) |
| Services call Prisma directly. There is **no repository layer** in Phase 1. | Convention; revisit only if a service becomes untestable |
| Expected failures are thrown as `AppError`; everything else is allowed to throw. | Code review and `error-handler.test.ts` |

Express 5 specifics: an async handler needs no `try/catch`, because a rejected promise is forwarded to the error handler; and `req.query` is a read-only getter, so never assign to it. Validate by calling `schema.parse(req.query)` at the top of the controller instead of writing middleware that rewrites the request.

The three layers, copied from the health module:

```ts
// health.routes.ts
healthRouter.get("/", getHealthHandler);
```

```ts
// health.controller.ts
// Express 5 forwards a rejected promise to the error handler, so no try/catch.
export async function getHealthHandler(_req: Request, res: Response) {
  const data: Health = await getHealth();
  res.json({ data, meta: {} });
}
```

```ts
// health.service.ts (excerpt): the only layer that touches Prisma
rows = await prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
```

## Validation (D-10)

Input is validated with Zod in the **controller**: call `schema.parse(...)` on `req.body`, `req.query` or `req.params`. You do not catch the failure. A `ZodError` is mapped centrally by [`backend/src/middleware/error-handler.ts`](../../backend/src/middleware/error-handler.ts) to a `400 VALIDATION_FAILED` response whose `details` lists `{ path, message }` for every problem. A request body that is not valid JSON is also `VALIDATION_FAILED`, with `details: null`.

The health endpoint takes no input, so the validation path is proven by a test-only route in [`backend/src/middleware/error-handler.test.ts`](../../backend/src/middleware/error-handler.test.ts), which uses the same call a real controller makes:

```ts
const leadInput = z.object({ name: z.string().min(1), age: z.number().int() });
// ...
const input = leadInput.parse(req.body);
```

Define the schemas in `<module>.schema.ts` and import `z` from `backend/src/lib/openapi.ts`, not from `zod`; that module switches on the OpenAPI extension once (see [OpenAPI](#openapi)).

## Response envelope (D-11)

Every response uses an envelope, except the OpenAPI document itself (see below).

Success is `{ data, meta }`. `data` is the payload; `meta` carries everything else, such as paging information for lists. `meta` is an empty object when there is nothing to say. Real response of `GET /api/v1/health`:

```json
{
  "data": {
    "status": "ok",
    "database": { "connected": true, "serverTime": "2026-10-08T10:36:35.918Z" }
  },
  "meta": {}
}
```

Error is `{ error: { code, message, details } }`: exactly these three keys, and `details` is always present (`null`, a list of `{ path, message }` for validation, or an object that an `AppError` carries). Real response when the database is down:

```json
{ "error": { "code": "SERVICE_UNAVAILABLE", "message": "Database is unavailable", "details": null } }
```

Clients switch on `code`, never on `message`. An error body never contains a stack trace or the text of an unexpected exception; the full error goes to the log only. This is asserted in `error-handler.test.ts`.

## Error codes (D-12)

The complete list lives in one place, `ERROR_CODES` in [`backend/src/lib/app-error.ts`](../../backend/src/lib/app-error.ts). This table must equal it.

| Code | HTTP status | Meaning |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | The request is not acceptable: a Zod validation failure (`details` is a list of `{ path, message }`) or a body that is not valid JSON. |
| `NOT_FOUND` | 404 | No route matched, or (from a service) the thing asked for does not exist. |
| `SERVICE_UNAVAILABLE` | 503 | A dependency the API needs, today the database, cannot be reached. |
| `INTERNAL_ERROR` | 500 | Anything unexpected. The message is always the generic "Internal server error". |

Expected failures are thrown as `AppError(code, status, message, details?, options?)`; the health service does it like this:

```ts
throw new AppError("SERVICE_UNAVAILABLE", 503, "Database is unavailable", null, {
  cause: error,
});
```

The optional `cause` keeps the original error for the log; it is never sent to the client.

Known gap: other failures raised by the JSON body parser, for example a body that is too large, are not mapped specially and currently become `INTERNAL_ERROR` (500). Add a code (such as a 413) the first time a feature needs one.

**Adding a code.** Adding is safe; renaming or removing is a breaking change for every client, including the future mobile app, so avoid it.

1. Add the code to `ERROR_CODES` in `backend/src/lib/app-error.ts`.
2. Throw it with `AppError` where it applies.
3. Add a row to the table above.
4. Update the tests that pin the list: the "lists exactly the four Phase 1 codes" test in `error-handler.test.ts` and the ErrorCode test in `backend/src/lib/openapi.test.ts`.
5. Run `pnpm --dir backend openapi:generate` and `pnpm --dir frontend api:types`, commit both generated files, and handle the new code in the user interface where it matters (see [frontend](frontend.md#error-handling-in-components)).

## OpenAPI

The API describes itself from the same Zod schemas it validates with, so documentation cannot drift from the code (D-10).

- [`backend/src/lib/openapi.ts`](../../backend/src/lib/openapi.ts) owns the `registry`, switches on the Zod OpenAPI extension once, and defines the shared `ErrorCode`, `ErrorResponse` and `ValidationDetail` components and the `envelope(schema)` helper for success responses.
- A module's `*.routes.ts` calls `registry.registerPath(...)` right beside its `router.get(...)`. Copy `health.routes.ts`.
- The document is OpenAPI 3.1 and is served at `GET /api/v1/openapi.json`.
- **Generate and commit it:** `pnpm --dir backend openapi:generate` writes [`backend/openapi/openapi.json`](../../backend/openapi/openapi.json). Commit the result whenever a route or schema changes.
- **Drift check:** `backend/src/lib/openapi.test.ts` fails when the committed file differs from what the code generates, so `pnpm --dir backend test` (and therefore CI) catches a forgotten regeneration.
- **The one raw-document exception:** `/api/v1/openapi.json` returns the bare OpenAPI document, not `{ data, meta }`, because OpenAPI tools need the bare document. No other response may skip the envelope.
- The frontend types are generated from this file; see [frontend](frontend.md#generating-api-types).

## Logging and request ids (D-21)

- [`backend/src/lib/logger.ts`](../../backend/src/lib/logger.ts) uses pino. Output is **JSON lines**, except that `NODE_ENV=development` uses `pino-pretty`, and tests are silent. Use the exported `logger` for anything outside a request.
- `httpLogger` writes **one line per request**. Every response carries an **`X-Request-Id`** header and the same id is on the log line. An inbound `X-Request-Id` is reused only if it matches `^[A-Za-z0-9._-]{8,64}$`; anything else is replaced with a new UUID. The request id lives in the header only, so the envelope keys stay as locked.
- `authorization` and `cookie` request headers and `set-cookie` response headers are redacted, and request bodies are never logged.
- A 5xx error is attached to the response so its full error and stack appear on that request's log line, never in the body.
- CORS exposes `X-Request-Id` to the browser, so the web app can show it. `helmet` sets baseline security headers.

## Environment

[`backend/src/env.ts`](../../backend/src/env.ts) validates the environment with Zod when it is first imported, prints each bad variable by name, and exits with code 1 before the server listens. Import `env` from it; never read `process.env` elsewhere (lint-enforced, with the three exceptions listed above). The variables are `NODE_ENV`, `PORT`, `DATABASE_URL` (required) and `CORS_ORIGINS`; [`backend/.env.example`](../../backend/.env.example) lists them with development values. Adding a variable means adding it to the Zod schema, to `.env.example`, and (if the container needs a different value) to `compose.yaml`.

## Prisma and the database

PostgreSQL is reached through Prisma 7 with the `pg` driver adapter ([`backend/src/lib/prisma.ts`](../../backend/src/lib/prisma.ts)). Only services import it. The schema is [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma); it has **no models yet** (the first ones arrive in Phase 2). The generated client goes to `backend/src/generated/prisma/`, which is git-ignored and recreated by `prisma generate`.

Run Prisma inside the API container, where the database host and credentials are already set:

```sh
docker compose exec api pnpm exec prisma validate
docker compose exec api pnpm exec prisma generate
docker compose exec api pnpm exec prisma migrate deploy
```

The container's start-up script ([`backend/docker/dev-entrypoint.sh`](../../backend/docker/dev-entrypoint.sh)) already runs `prisma generate` and `prisma migrate deploy` on every start, so committed migrations are applied automatically.

**Creating the first migration (Phase 2).** Add the models to `schema.prisma`, then, with the stack running:

```sh
docker compose exec api pnpm exec prisma migrate dev --name <short-description>
```

Commit the new folder under `backend/prisma/migrations/` together with the schema change. Never edit a migration that has been merged. This command was not run in Phase 1 because there are no models.

Tests use their own `opencrm_test` database, created and migrated automatically; see [testing](testing.md#backend-tests).
