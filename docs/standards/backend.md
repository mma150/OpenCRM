# Backend standard

How the API in `backend/` is built: module layout, layering, validation, the response envelope, error codes, OpenAPI, logging, environment and Prisma. The working example is the health module, [`backend/src/modules/health/`](../../backend/src/modules/health/). Each rule below says what enforces it: an ESLint rule, a test, or (where nothing automatic exists) code review.

Related: [structure](structure.md), [testing](testing.md), [frontend](frontend.md).

## Request path

```text
request -> httpLogger -> helmet -> cors (allow-list, credentials) -> cookieParser
        -> originCheck -> express.json (100 kB) -> /api/v1 routes (Cache-Control: no-store)
        -> [rate limiter] -> [authenticate] -> [requireRole] -> controller -> service -> Prisma -> PostgreSQL
unmatched route -> notFound (NOT_FOUND)   any thrown error -> errorHandler (error envelope)
```

The order is set in [`backend/src/app.ts`](../../backend/src/app.ts): the logger comes first so every response, including errors, has a request id. The bracketed steps are per route; see [Authentication and access](#authentication-and-access). Every module router is mounted in [`backend/src/routes.ts`](../../backend/src/routes.ts), and the whole API lives under `/api/v1`.

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
| Services call Prisma directly. There is **no repository layer**. | Convention; revisit only if a service becomes untestable |
| Besides services, only the shared session and link helpers in `src/lib/` (`sessions.ts`, `account-links.ts`), `addTimelineEntry` in `lib/timeline.ts` and `assertAssignable` in `lib/record-owner.ts` call Prisma, because the `authenticate` middleware and several modules need them. | Code review |
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

Every request body schema is **strict** (`z.strictObject({...})`): an unknown key is `VALIDATION_FAILED`, so a request can never set a field the route does not offer (a user cannot send `role` to `PATCH /auth/me`). Every `:id` path parameter is parsed with `z.uuid()`. [`backend/src/middleware/endpoint-contract.test.ts`](../../backend/src/middleware/endpoint-contract.test.ts) walks the OpenAPI registry and fails when a route accepts an unknown key, a missing body or a malformed id, or when a route documented as signed-in answers without a session; a route that takes no input must be added to the list at the top of that test on purpose. A body in which every key is optional may be left out altogether (`DELETE /pipeline-stages/:id`, `POST /opportunities/:id/reopen`): the controller parses `req.body ?? {}`, the route documents the body as not required, and the route is named in `ROUTES_WITH_OPTIONAL_BODY` in the same test. An unknown key is still refused.

A rule that Zod cannot express (the password is too common, the manager is not a Sales Manager) is raised by the service in the same shape, so the web form shows it beside the field. For a rule about one field (an owner the caller may not assign to, a company the caller cannot see) use `fieldError(path, message)` from `lib/app-error.ts`.

The mapping itself is proven by a test-only route in [`backend/src/middleware/error-handler.test.ts`](../../backend/src/middleware/error-handler.test.ts), which uses the same call a real controller makes:

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
| `VALIDATION_FAILED` | 400 | The request is not acceptable: a Zod validation failure or a rule checked in a service (`details` is a list of `{ path, message }`), a body that is not valid JSON, or an action that does not apply to this user (`details: null`). |
| `NOT_FOUND` | 404 | No route matched, or (from a service) the thing asked for does not exist, or it is a record the caller may not see (see [Record access](#record-access)). |
| `SERVICE_UNAVAILABLE` | 503 | A dependency the API needs, today the database, cannot be reached. |
| `INTERNAL_ERROR` | 500 | Anything unexpected. The message is always the generic "Internal server error". |
| `UNAUTHENTICATED` | 401 | No session, or one that has expired, been ended, or belongs to a deactivated user. The only code a client treats as "signed out". |
| `INVALID_CREDENTIALS` | 401 | Sign-in failed. One message for a wrong email and a wrong password. |
| `FORBIDDEN` | 403 | Not allowed: wrong role (including a Read-only user changing a record), a state-changing request from an origin that is not allowed, or an Admin deactivating their own account. |
| `ACCOUNT_DEACTIVATED` | 403 | The password was right, but the account is deactivated. |
| `ACCOUNT_LOCKED` | 423 | Too many wrong passwords; `details.retryAfterSeconds` says how long the lock lasts. |
| `RATE_LIMITED` | 429 | Too many requests to a public auth route; `details.retryAfterSeconds` and the `Retry-After` header say when to try again. |
| `INVALID_TOKEN` | 400 | An invite or password-reset link that is unknown, used, expired or cancelled. |
| `SETUP_CLOSED` | 409 | First-run setup was called after a user exists. |
| `EMAIL_IN_USE` | 409 | Another user already has this email. |
| `LAST_ADMIN` | 409 | The change would leave no Admin who can sign in. |
| `PAYLOAD_TOO_LARGE` | 413 | The JSON body is over the 100 kB limit set in `app.ts`. |
| `LEAD_CONVERTED` | 409 | The lead has been converted, so it cannot be edited, marked lost, deleted or converted again (see [Converting a lead](#converting-a-lead)). |

Expected failures are thrown as `AppError(code, status, message, details?, options?)`; the health service does it like this:

```ts
throw new AppError("SERVICE_UNAVAILABLE", 503, "Database is unavailable", null, {
  cause: error,
});
```

The optional `cause` keeps the original error for the log; it is never sent to the client.

Two HTTP statuses carry more than one code (401 and 403), which is why clients switch on `code` and never on the status: a wrong password must not look like an expired session.

**Adding a code.** Adding is safe; renaming or removing is a breaking change for every client, including the future mobile app, so avoid it.

1. Add the code to `ERROR_CODES` in `backend/src/lib/app-error.ts`.
2. Throw it with `AppError` where it applies.
3. Add a row to the table above.
4. Update the tests that pin the list: the "lists exactly the documented codes" test in `error-handler.test.ts` and the ErrorCode test in `backend/src/lib/openapi.test.ts`.
5. Run `pnpm --dir backend openapi:generate` and `pnpm --dir frontend api:types`, commit both generated files, and handle the new code in the user interface where it matters (see [frontend](frontend.md#error-handling-in-components)).

## OpenAPI

The API describes itself from the same Zod schemas it validates with, so documentation cannot drift from the code (D-10).

- [`backend/src/lib/openapi.ts`](../../backend/src/lib/openapi.ts) owns the `registry`, switches on the Zod OpenAPI extension once, and defines the shared `ErrorCode`, `ErrorResponse` and `ValidationDetail` components and the `envelope(schema)` helper for success responses.
- A module's `*.routes.ts` calls `registry.registerPath(...)` right beside its `router.get(...)`. Copy `health.routes.ts`; for routes with a body, path parameters or a session, copy [`users.routes.ts`](../../backend/src/modules/users/users.routes.ts), which uses the `jsonBody`, `jsonResponse`, `errorResponse` and `sessionSecurity` helpers from `lib/openapi.ts`. A signed-in route must carry `security: sessionSecurity`; the endpoint contract test relies on it.
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

[`backend/src/env.ts`](../../backend/src/env.ts) validates the environment with Zod when it is first imported, prints each bad variable by name, and exits with code 1 before the server listens. Import `env` from it; never read `process.env` elsewhere (lint-enforced, with the three exceptions listed above). The variables are `NODE_ENV`, `PORT`, `DATABASE_URL` (required), `CORS_ORIGINS`, `APP_URL`, `TRUST_PROXY`, `SESSION_COOKIE_SECURE` and the mail settings `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` (required when `SMTP_HOST` is set); [`backend/.env.example`](../../backend/.env.example) lists them with development values and says what each does. An empty value (`SMTP_HOST=`) counts as not set. Adding a variable means adding it to the Zod schema, to `.env.example`, and (if the container needs a different value) to `compose.yaml`.

## Prisma and the database

PostgreSQL is reached through Prisma 7 with the `pg` driver adapter ([`backend/src/lib/prisma.ts`](../../backend/src/lib/prisma.ts)). Only services import it. The schema is [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma); its models are `User`, `Session`, `AuthToken` (invite and password-reset links), the owned records `Lead`, `Contact`, `Company` and `Opportunity`, `PipelineStage` (see [The pipeline and opportunities](#the-pipeline-and-opportunities)) and `TimelineEntry` (see [The timeline](#the-timeline)). Ids are UUID version 7 (`@default(uuid(7))`). The generated client goes to `backend/src/generated/prisma/`, which is git-ignored and recreated by `prisma generate`.

Run Prisma inside the API container, where the database host and credentials are already set:

```sh
docker compose exec api pnpm exec prisma validate
docker compose exec api pnpm exec prisma generate
docker compose exec api pnpm exec prisma migrate deploy
```

The container's start-up script ([`backend/docker/dev-entrypoint.sh`](../../backend/docker/dev-entrypoint.sh)) already runs `prisma generate` and `prisma migrate deploy` on every start, so committed migrations are applied automatically.

**Creating a migration.** Change the models in `schema.prisma`, then, with the stack running:

```sh
docker compose exec api pnpm exec prisma migrate dev --name <short-description>
docker compose exec api pnpm exec prisma generate
```

Commit the new folder under [`backend/prisma/migrations/`](../../backend/prisma/migrations/) together with the schema change. Never edit a migration that has been merged.

**Check-then-write rules.** A rule of the form "check, then write on the strength of the check" (only one first Admin, never zero Admins) is not safe when two requests arrive together. Run it in `prisma.$transaction(async (tx) => { await lockUserAdministration(tx); ... })`; `lockUserAdministration` in `lib/prisma.ts` takes a PostgreSQL advisory lock that makes the second transaction wait for the first. `users.test.ts` proves it with simultaneous requests. `lockPipelineStages` is the same lock for changes to the pipeline stages (never fewer than one open stage, no two stages with one name). A third guard is a conditional write as the first statement of the transaction: converting a lead starts with `updateMany({ where: { id, status: { not: "CONVERTED" } } })`, so a second request waits on the row and then changes nothing. A unique column is the other guard: catch Prisma error `P2002` and turn it into the right `AppError`, as `users.service.ts` does for `EMAIL_IN_USE`.

Tests use their own `opencrm_test` database, created and migrated automatically; see [testing](testing.md#backend-tests).

## Authentication and access

Sign-in is a server-side session (D-01): a random 256-bit token whose SHA-256 hash is a row in `Session`. The browser carries the token in an httpOnly, `SameSite=Lax` cookie named `opencrm_session` (`__Host-opencrm_session` when `SESSION_COOKIE_SECURE` is true); any other client may send the same token as `Authorization: Bearer <token>`. The session is looked up on every request, so signing out, deactivating a user and resetting a password take effect at once. It lasts 30 days from its last use; the expiry is pushed forward at most once an hour. The pieces:

| Piece | File | Use |
| --- | --- | --- |
| `authenticate` | [`middleware/authenticate.ts`](../../backend/src/middleware/authenticate.ts) | Put it on every route that needs a signed-in user; otherwise the answer is `UNAUTHENTICATED`. |
| `getAuth(req)` | same file | In a controller, returns `{ user, sessionId }` for the request. Pass plain values (`user.id`) on to the service. |
| `requireRole(...roles)` | [`middleware/require-role.ts`](../../backend/src/middleware/require-role.ts) | After `authenticate`; anyone else gets `FORBIDDEN`. Hiding a screen in the web app is cosmetic, this is the enforcement. |
| Origin check | [`middleware/origin-check.ts`](../../backend/src/middleware/origin-check.ts) | The CSRF defence, applied to the whole app: a request that is not GET, HEAD or OPTIONS must carry an `Origin` from `CORS_ORIGINS`, or carry no session cookie at all (a Bearer client). |
| Rate limiters | [`middleware/rate-limit.ts`](../../backend/src/middleware/rate-limit.ts) | Per address and per email, on the public auth routes only. Counters are in memory. `createApp({ rateLimit })` lets tests change the limits. |
| Sessions | [`lib/sessions.ts`](../../backend/src/lib/sessions.ts), [`lib/session-cookie.ts`](../../backend/src/lib/session-cookie.ts) | Create and resolve sessions; set, clear and read the cookie. |
| Passwords | [`lib/password.ts`](../../backend/src/lib/password.ts) | Argon2id hashing, and the one password rule: 10 to 128 characters and not on the common-password list (`lib/common-passwords.txt`). |
| Links | [`lib/account-links.ts`](../../backend/src/lib/account-links.ts) | Single-use invite (7 days) and password-reset (1 hour) links, built from `APP_URL` and stored hashed. |

A module that is for signed-in users protects its whole router. Order matters: a route registered above a guard is not covered by it, which is how the users module keeps one route open to every signed-in user and the rest for Admins:

```ts
// users.routes.ts
usersRouter.use(authenticate);
usersRouter.get("/assignable", listAssignableUsersHandler); // any signed-in user
usersRouter.use(requireRole("ADMIN")); // everything below
```

`requireRole` answers "may this role use this route at all". Whether a user may see or change one particular record depends on who owns it, and is decided in the service; see [Record access](#record-access).

Default limits on the public auth routes, per 5 minutes: 30 requests per address (successful sign-ins are not counted), 8 per email address on sign-in and forgot-password, and 300 per address on the first-run check. Ten wrong passwords in a row lock an account for 15 minutes; the lock is stored on the user, clears on its own and is cleared by a password reset.

Rules that keep sign-in from leaking information, each pinned by a test in `auth.test.ts`: a wrong email and a wrong password get the same answer; forgot-password always answers 200; a deactivated account is named only after the correct password; tokens and links are never logged and never appear in an API URL (they travel in the POST body).

Production note: the cookie is `SameSite=Lax`, so the web app and the API must be on the same site (the same host, or two hosts under one registrable domain such as `app.example.com` and `api.example.com`). Behind a reverse proxy set `TRUST_PROXY` to the number of proxies, or every visitor shares one rate-limit bucket.

## Record access

Leads, contacts, companies and opportunities (and later tasks) are **owned records**: each has an `ownerId` column and an `owner` relation to `User`, and who may see or change one depends on the caller's role and on who the owner is (ROLE-04 to ROLE-08).

| Role | Sees | Changes |
| --- | --- | --- |
| Admin | every record | every record |
| Sales Manager | records owned by themselves or by a user whose `managerId` is the manager | the same records |
| Sales Rep | records they own | the same records |
| Read-only | every record | nothing |

The rules live in one file, [`backend/src/lib/record-access.ts`](../../backend/src/lib/record-access.ts), and are applied in the **service**, never in a controller or only in the web app. A service takes the signed-in user as its first argument (`actor`; the controller passes `getAuth(req).user`). The helpers are pure functions: they return Prisma `where` fragments or throw, and the service runs the query.

| Helper | Use |
| --- | --- |
| `visibleRecords(actor)` | The `where` fragment for "records this user may see". Spread it into **every** query on the model: the list, and the lookup before a read, update or delete. |
| `visibleLiveRecords(actor)` | The same fragment plus `deletedAt: null`: what the caller may see of a model with a soft delete. Use it to show one kind of record inside another (an opportunity's contact, the lead a contact came from) without importing the other record's service. |
| `assertCanWrite(actor)` | First line of every function that creates, changes or deletes. Throws `FORBIDDEN` for a Read-only user. |
| `assertCanReassign(actor)` | First line of a function that hands a record to another owner. Throws `FORBIDDEN` unless the caller is an Admin or a Sales Manager. |
| `assertAssignable(actor, ownerId, records)` | In [`lib/record-owner.ts`](../../backend/src/lib/record-owner.ts), with `withOwner` (the `include` for a record's `owner`). Call it on create and on assign; it throws the `ownerId` validation failure described below. |
| `assignableUsers(actor)` | The `where` fragment on `User` for "people this user may make the owner": for an Admin, any active Admin, Sales Manager or Sales Rep; for a Sales Manager, themselves and their active reps; for a Sales Rep, themselves; for a Read-only user, nobody. `GET /users/assignable` returns exactly this list for an owner picker. |

The leads service shows the whole pattern:

```ts
// leads.service.ts
function visibleLeads(actor: Actor): Prisma.LeadWhereInput {
  return { deletedAt: null, ...visibleRecords(actor) };
}

async function findLead(actor: Actor, id: string) {
  const lead = await prisma.lead.findFirst({ where: { id, ...visibleLeads(actor) }, include: withOwner });
  if (!lead) {
    throw new AppError("NOT_FOUND", 404, "Lead not found");
  }
  return lead;
}

export async function deleteLead(actor: Actor, id: string): Promise<void> {
  assertCanWrite(actor); // Read-only: FORBIDDEN
  await findLead(actor, id); // not theirs to see: NOT_FOUND
  await prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
}
```

Rules that follow from it, each pinned in `leads.test.ts`, `contacts.test.ts`, `companies.test.ts` and `opportunities.test.ts`:

- **Outside the caller's reach means `NOT_FOUND`, never `FORBIDDEN`**, on read, update, delete and every other action on one record, with the same body as an id that does not exist. A list simply leaves the record out, and a filter (`ownerId=...`) can narrow the list but never widen it.
- **`FORBIDDEN` is only for the role itself**: a Read-only user writing, a Sales Rep reassigning. It says nothing about any one record, so it gives nothing away.
- **An owner the caller may not assign to is `VALIDATION_FAILED`** with `details: [{ path: "ownerId", ... }]`, on create and on assign, so the form shows it beside the field.
- **Soft delete.** An owned record has `deletedAt`; deleting sets it, and the model's one "visible" function (`visibleLeads`) excludes deleted rows from every query, so no response ever shows one.
- **A record shown inside another follows the same rules.** A contact answers with its `company` only when the caller may see that company, and `null` otherwise; a company's `contactCount` counts only the contacts the caller may see. The contacts service gets the company from an `include` built with the company's own visible function (`company: { where: visibleCompanies(actor), ... }`), and applies the same fragment wherever a request names a company: the `companyId` filter, the search on the company name, and the `companyId` in a body, where a company the caller cannot see is `VALIDATION_FAILED` on `companyId`, exactly like one that does not exist. An opportunity's `contact` and `company`, a lead's `convertedTo` and the `convertedFromLead` of a contact and an opportunity follow the same rule, with `visibleLiveRecords(actor)` in the `include`.
- **Deleting a record that others point at unlinks them in the same transaction.** Deleting a company sets `companyId` to null on its contacts and its opportunities (every one, not only those the caller can see) together with the soft delete; deleting a contact does the same for `contactId` on its opportunities. The contacts and opportunities stay.
- **A write answers with a fresh read.** Once a record's `include` names three or more relations (a lead, a contact, an opportunity), Prisma would read them side by side on the one connection of the write's transaction, and the `pg` driver warns about that. So a function that changes such a record writes without the `include` and ends with `return getLead(actor, id)` (or `getContact`, `getOpportunity`). Inside a transaction, include at most `withOwner`.
- **Shared field rules** for owned records are in [`lib/record-fields.ts`](../../backend/src/lib/record-fields.ts): `optionalText(max)` (trimmed, `""` stored as null), `optionalEmailSchema`, `moneySchema` (a number from 0 with at most two decimals, sent and answered as a JSON number), `daySchema` (a day such as `"2026-11-15"`), `recordLinkSchema` (`{ id, name }`, how one record names another), `recordIdParamsSchema`, `recordOwnerSchema` and `deletedResponseSchema`. Use them instead of writing the rule again.
- A new owned model names its columns `ownerId` / `owner` so that `visibleRecords` fits without change, uses `onDelete: Restrict` on the owner (users are never deleted), and has its rows deleted in `resetRecords()` in `backend/test/helpers.ts`.

## List endpoints

Every list that can grow (leads, contacts, companies, opportunities) has the same query string and the same `meta`, defined once in [`backend/src/lib/list-query.ts`](../../backend/src/lib/list-query.ts):

| Query | Meaning | Default |
| --- | --- | --- |
| `search` | Free text, up to 100 characters. Every word must match one of the columns the module chooses, case-insensitively. | none |
| `sort` | One of the fields the module allows. | chosen by the module |
| `order` | `asc` or `desc`. | `desc`, or `asc` when the module says so (a list that opens sorted by name) |
| `page` | 1 or more. | 1 |
| `pageSize` | 1 to 100. | 25 |
| filters | Named after the field (`status`, `source`, `ownerId`, `companyId`, `contactId`, `stageId`, `industry`), added by the module. | none |

The answer is `{ data: [...], meta: { page, pageSize, total } }`, where `total` counts every match the caller may see, not only this page. A page past the end is an empty list, not an error. A bad value (`page=0`, `pageSize=101`, an unknown `sort` or filter value) is `VALIDATION_FAILED` naming the parameter. An unknown query parameter is ignored (only request bodies are strict).

How a module uses it, copied from leads:

```ts
// leads.schema.ts
export const leadListQuerySchema = listQuerySchema(
  ["name", "company", "status", "createdAt", "updatedAt", "lastContactAt"],
  "createdAt",
).extend({
  status: leadStatusSchema.optional(),
  source: leadSourceSchema.optional(),
  ownerId: z.uuid().optional(),
});

export const leadListResponseSchema = listEnvelope(leadSchema);
```

- The controller calls `leadListQuerySchema.parse(req.query)` and builds `meta` as a `ListMeta`; the service returns a `Page<T>` (`{ items, total }`) and uses `pageWindow(query)` for Prisma's `skip` and `take`.
- `listQuerySchema(sortFields, defaultSort, defaultOrder)` takes the default order as its third argument; contacts and companies pass `"asc"` because they open sorted by name.
- Use `searchWords(query.search)` with Prisma's `contains`: Prisma sends `%` and `_` to PostgreSQL as wildcards, and `searchWords` escapes them. A free-text filter matched with a case-insensitive `equals` (the companies' `industry`) goes through `escapeWildcards` for the same reason.
- A row without the sorted value comes last in both directions. For a column that is `{ sort: order, nulls: "last" }`. Across a relation (contacts by company name) one `ORDER BY` cannot say it, so `findPageByCompany` in `contacts.service.ts` reads two lists end to end, the contacts with a visible company and then the rest, and runs the page window across both.
- Always end `orderBy` with the id, so rows with equal values keep one fixed place across pages.
- Add an index for each column the list filters or sorts on.
- A short list that cannot grow (users, pipeline stages) may stay unpaged, as `GET /users` does.
- A list with one fixed order (a timeline, the activity feed) takes only the paging half: start from `pageQuerySchema` instead of `listQuerySchema(...)`.

## The timeline

Every dated thing that happens to a record is one row in **one table**, `TimelineEntry`: a conversation, a note, and the entries the system writes itself (`CREATED`, `STATUS_CHANGE`, `ASSIGNMENT`). A record page therefore reads a single ordered stream (`GET /leads/:id/timeline`, `/contacts/:id/timeline`, `/companies/:id/timeline`, `/opportunities/:id/timeline`), and the team activity feed (`GET /activity`) reads the same rows. The shared pieces are in [`backend/src/lib/timeline.ts`](../../backend/src/lib/timeline.ts); the routes are in [`modules/timeline/`](../../backend/src/modules/timeline/) and [`modules/activity/`](../../backend/src/modules/activity/).

| Column | Meaning |
| --- | --- |
| `kind` | `CONVERSATION`, `NOTE`, `CREATED`, `STATUS_CHANGE` or `ASSIGNMENT`. |
| `conversationType` | `CALL`, `MEETING`, `EMAIL` or `MESSAGE`; only for a conversation. |
| `body` | What was discussed, or the note. `null` for system entries. |
| `details` | JSON for system entries. A lead's status change: `{ from, to }`, plus `{ reason, note }` when it was marked lost, or `{ contact, company, opportunity }` (each `{ id, name }` or null) when it was converted. An opportunity's stage change: `{ from, to, fromKind, toKind }` with the stages' names as they were and their kinds, plus `{ reason }` when it was closed. An assignment: `{ fromOwner: { id, name }, toOwner: { id, name } }`. The `CREATED` entry of a record made by converting a lead: `{ fromLead: { id, name } }`. |
| `occurredAt` | When it happened: chosen by the user for a conversation (not more than 5 minutes ahead), the time of writing for everything else. Timelines sort by it, newest first, then by `createdAt`, then by `id`. |
| `authorId` | Who wrote it: always the signed-in user, from the session. |
| `leadId`, `contactId`, `companyId`, `opportunityId` | The record: one nullable column per record type, and exactly one of them is set on every entry; the check constraint `TimelineEntry_one_record` makes the database refuse anything else. Code does not name these columns: it passes a `RecordRef`, `{ type, id }` with the type `"lead"`, `"contact"`, `"company"` or `"opportunity"`, and `recordColumn(record)` in `lib/timeline.ts` turns it into the column. |

The rules, each pinned in `timeline.test.ts`:

- **Entries are permanent (CONV-05).** There is no update and no delete route, and no code path changes a row after it is written. `addTimelineEntry(tx, entry)` is the only code that writes the table, and it only inserts. Never add a `PATCH`, `PUT` or `DELETE` for an entry; a correction is a new note.
- **The author and the time come from the server.** The body schemas are strict, so a request cannot send `authorId` or `createdAt`; `occurredAt` is accepted for a conversation only.
- **A system entry is written in the same transaction as the change it records**, by the service that makes the change, through the helper:

  ```ts
  // leads.service.ts (assignLead)
  await prisma.$transaction(async (tx) => {
    const changed = await tx.lead.update({ where: { id }, data: { ownerId }, include: withOwner });
    await addTimelineEntry(tx, {
      kind: "ASSIGNMENT",
      authorId: actor.id,
      record: { type: "lead", id },
      details: { fromOwner: lead.owner, toOwner: changed.owner },
    });
  });
  return getLead(actor, id);
  ```

  So there is never a change without its entry or an entry without its change: if either write fails, both are undone. A change that is refused, or that changes nothing the timeline records (editing a field other than the status, assigning to the owner the lead already has), writes no entry.
- **What writes what, for a lead:** creating it writes `CREATED`; a status change through `PATCH`, mark-lost, reopening and converting each write `STATUS_CHANGE`; assigning writes `ASSIGNMENT`; logging a conversation writes `CONVERSATION` and moves the lead's `lastContactAt` forward to it (never back) in the same transaction.
- **For a contact and a company:** creating writes `CREATED` and assigning writes `ASSIGNMENT`; editing (a contact's company included) and deleting write nothing. A conversation on a contact moves the contact's `lastContactAt` the same way. A company has no `lastContactAt`, and a conversation logged on a company does not touch its contacts.
- **For an opportunity:** creating writes `CREATED`; a move to another stage, closing, reopening and the deletion of its stage each write `STATUS_CHANGE`; assigning writes `ASSIGNMENT`; editing, deleting, a move to the stage it is already in and a correction of the close reason write nothing. A conversation moves the opportunity's own `lastContactAt`, not its contact's.
- **Access follows the record.** Reading a timeline needs a record the caller may see, and writing on one follows its write rule, exactly as in [Record access](#record-access): outside the caller's reach is `NOT_FOUND`, a Read-only user writing is `FORBIDDEN`. The timeline service asks the record's own service (`findLead`, `findContact`, `findCompany`, listed in its `findRecord` table) rather than repeating the rule. An id of another type (`/contacts/<a lead's id>/timeline`) is `NOT_FOUND` like any other unknown id. A converted or lost lead and a closed opportunity still accept conversations and notes.
- **A soft-deleted record keeps its entries in the table**, but they appear nowhere: its timeline is `NOT_FOUND` and the activity feed leaves them out.
- **The activity feed names each entry's record** as `{ type, id, name }`, with the type `"LEAD"`, `"CONTACT"`, `"COMPANY"` or `"OPPORTUNITY"` and the name a person's full name, or the name of a company or an opportunity.
- **The activity feed is scoped by author, not by record owner**: an Admin sees every entry, a Sales Manager the entries written by themselves or by a user whose `managerId` is the manager; Sales Reps and Read-only users get `FORBIDDEN`. `from` and `to` are inclusive and take a day (the whole day, in UTC) or an exact moment. `meta.summary` counts everything the filters match, not only the page.

**Adding a kind.** A new kind (`EMAIL`, `TASK`) is a new value in the `TimelineKind` enum and in `timelineKindSchema`, plus an `addTimelineEntry` call in the service that does the thing.

**Adding a record type** (opportunities were the fourth; `20261010064650_opportunities` is the migration to copy). The three routes, their access rules and the feed come from shared code, so a new type is a short list. Steps 2 and 4 are checked by the compiler, because `RecordType` is a closed union: a missing case does not build.

1. `schema.prisma`: add the nullable `<record>Id` column and relation to `TimelineEntry`, with `@@index([<record>Id, occurredAt])`. Create the migration with `prisma migrate dev --create-only`, and in its SQL drop and re-create the check constraint `TimelineEntry_one_record` with the new column in the `num_nonnulls(...)` list (Prisma does not write check constraints); then apply it.
2. `lib/timeline.ts`: add the type to `RECORD_TYPES` and a case to `recordColumn`.
3. The record's service: export its `find<Record>(actor, id)`, which throws `NOT_FOUND` for a record the caller may not see, and call `addTimelineEntry(tx, { ..., record: { type, id } })` in the same transaction as each change that is history.
4. `timeline.service.ts`: add the find function to `findRecord`, and a case to `moveLastContactAt` (move the date, or do nothing if the type has none).
5. `timeline.routes.ts`: add one line to `RECORDS`. That registers `GET /<records>/:id/timeline`, `POST .../conversations` and `POST .../notes` with their OpenAPI entries.
6. `activity.schema.ts` and `activity.service.ts`: add the type to the `record.type` enum, to `withRecord`, to `recordOf` and to `ofLiveRecords`. Nothing checks this step for you except the tests in step 7.
7. Tests: add the type to the `describe.each` table in `timeline.test.ts` and to the mixed-types block in `activity.test.ts`, extend the route lists in `endpoint-contract.test.ts` and `openapi.test.ts`, and delete its rows in `resetRecords()`.

## The pipeline and opportunities

There is one sales pipeline. Its stages are rows of `PipelineStage` ([`modules/pipeline-stages/`](../../backend/src/modules/pipeline-stages/)); an opportunity ([`modules/opportunities/`](../../backend/src/modules/opportunities/)) is an owned record that sits in exactly one stage.

**Stages.** A stage has a `kind`: `OPEN`, `WON` or `LOST`. The migration seeds New, Qualified, Proposal and Negotiation (open), Won and Lost. Exactly one Won and one Lost stage always exist: no route creates or deletes one, they can only be renamed. `pipelineOrder` in the stages service is the one order everything uses: the open stages by `position`, then Won, then Lost. The `position` in a response is the stage's place in that order, counted from 0.

| Route | Who | Rules |
| --- | --- | --- |
| `GET /pipeline-stages` | any signed-in user | `opportunityCount` counts the opportunities the caller may see. |
| `POST /pipeline-stages` `{ name }` | Admin | Added as the last open stage. At most 20 open stages. |
| `PATCH /pipeline-stages/:id` `{ name }` | Admin | Any stage. |
| `PUT /pipeline-stages/order` `{ ids }` | Admin | `ids` is every open stage exactly once. |
| `DELETE /pipeline-stages/:id` `{ moveToStageId? }` | Admin | Open stages only, never the last one. A stage that holds opportunities needs `moveToStageId`, another open stage; each moved opportunity gets a `STATUS_CHANGE` entry in the same transaction. |

- Every one of these answers with the **whole pipeline in order**, so a client never works out positions itself.
- A name is 1 to 50 characters and unique whatever the case; a taken name is `VALIDATION_FAILED` on `name`. A bad `ids` or `moveToStageId` is `VALIDATION_FAILED` on that field. Deleting the Won, the Lost or the last open stage, and adding a 21st open stage, are `VALIDATION_FAILED` with `details: null` (the action does not apply). An unknown stage id in the path is `NOT_FOUND`.
- Every change runs in a transaction that starts with `lockPipelineStages(tx)`.
- A stage is deleted for real (it is configuration, not a record). History survives because a timeline entry keeps the stages' names, not their ids.

**Opportunities.** The module follows [Record access](#record-access), [List endpoints](#list-endpoints) and [The timeline](#the-timeline) like contacts do. What is its own:

- **`status` is the kind of the stage** (`OPEN`, `WON`, `LOST`). It is not stored, so it cannot disagree with the stage; the `status` filter is a filter on `stage.kind`.
- **`value`** is a JSON number, 0 or more, at most two decimals (`moneySchema`), 0 when none is given. **`expectedCloseDate`** is a day (`"2026-11-15"`) or null.
- **Moving** (`POST /opportunities/:id/stage` `{ stageId }`) takes an open stage only; the Won or Lost stage is `VALIDATION_FAILED` on `stageId`. Moving a closed opportunity to an open stage reopens it.
- **Closing** (`POST .../close` `{ outcome: "WON" | "LOST", reason }`) moves it to the Won or Lost stage and sets `closeReason` and `closedAt`. The reason is free text up to 1000 characters, needed for `LOST` and optional for `WON`. A won opportunity can be closed as lost (and the other way round) directly; closing it the same way again only replaces the reason.
- **Reopening** (`POST .../reopen` `{ stageId? }`) moves it to the open stage named, or to the first, and clears `closeReason` and `closedAt`. An opportunity that is already open is `VALIDATION_FAILED` with `details: null`.
- `findOpenStage(stageId, path)` in the stages service is the one check for "an open stage, or the first when none is named"; create, move, reopen and lead conversion all use it.
- **The board** (`GET /opportunities/board`) answers one column per stage in pipeline order, Won and Lost included: `{ stage, count, totalValue, opportunities }`. It takes the list's `search` and `ownerId` and the same visibility rules. `opportunities` holds at most 50 cards (`BOARD_CARD_LIMIT`), the most recently changed first; `count` and `totalValue` cover the whole column. It is not paged: a column with more cards than it shows links to the list filtered by `stageId`.

## Converting a lead

`POST /leads/:id/convert` (LEAD-04) turns a lead into a contact and, if asked, a company and an opportunity, in one transaction (`convertLead` in `leads.service.ts`).

```json
{
  "company": { "mode": "create", "name": "Northwind" },
  "contact": { "mode": "create" },
  "opportunity": { "create": true, "name": "Fleet deal", "value": 48000, "stageId": "..." }
}
```

- `company` is `{ mode: "create", name }`, `{ mode: "existing", id }` or `{ mode: "none" }`; `contact` is `{ mode: "create" }` or `{ mode: "existing", id }`. An existing one must be a record the caller may see (`VALIDATION_FAILED` on `company.id` or `contact.id` otherwise) and is linked, never changed.
- A new contact takes the lead's first and last name, job title, email, phone, notes and `lastContactAt`, and belongs to the company chosen. A new opportunity is linked to the contact and the company; its name defaults to the company's name or else the lead's name, its value to the lead's `estimatedValue` or else 0, its stage to the first open stage. The other `opportunity` keys are ignored when `create` is false.
- **Everything new belongs to the lead's owner**, whoever converts it; `createdById` is the caller.
- **The lead keeps its history.** No timeline row is copied or moved. The lead becomes `CONVERTED` with `convertedAt` and the ids of what it became, and stays readable with its timeline. Its `STATUS_CHANGE` entry names the contact, company and opportunity; the `CREATED` entry of each record the conversion made carries `details.fromLead`. An existing contact or company gets no entry.
- **The link is in the API both ways:** a lead answers with `convertedTo: { contact, company, opportunity }` (null until it is converted), a contact and an opportunity with `convertedFromLead`. Each is `{ id, name }`, or null when there is none or the caller may not see it.
- **A converted lead is final.** `PATCH`, mark-lost, delete and a second convert answer `409 LEAD_CONVERTED`. It can still be read, reassigned, and written on (conversations and notes). A lost lead must be reopened before it can be converted (`VALIDATION_FAILED`, `details: null`).
- If any step fails, nothing is kept: `leads.test.ts` makes the third timeline entry fail and finds no contact, company or opportunity and an unconverted lead.

## Email

[`backend/src/lib/mailer.ts`](../../backend/src/lib/mailer.ts) is the only place that sends email. `sendMail({ to, subject, text })` returns `true` when the message was handed to the SMTP server and `false` when email is off (`SMTP_HOST` not set) or sending failed; it never throws, so a request never fails because of email (D-10). `isMailConfigured()` says whether email is on. Messages are plain text. In the Compose stack the API sends to [Mailpit](http://localhost:8025), a local inbox, so no email leaves your machine. When an invite or reset link cannot be emailed, the API returns the link to the Admin instead (`LinkResult` in the users module).
