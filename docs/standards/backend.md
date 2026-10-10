# Backend standard

How the API in `backend/` is built: module layout, layering, validation, the response envelope, error codes, OpenAPI, logging, environment and Prisma. The working example is the health module, [`backend/src/modules/health/`](../../backend/src/modules/health/). Each rule below says what enforces it: an ESLint rule, a test, or (where nothing automatic exists) code review.

Related: [structure](structure.md), [testing](testing.md), [frontend](frontend.md).

## Request path

```text
request -> httpLogger -> helmet -> cors (allow-list, credentials) -> cookieParser
        -> originCheck -> express.json (100 kB; not for /api/v1/imports, which reads its own
           body after its sign-in and role checks) -> /api/v1 routes (Cache-Control: no-store)
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
| Besides services, only the shared session and link helpers in `src/lib/` (`sessions.ts`, `account-links.ts`), `addTimelineEntry` and `addCreatedEntries` in `lib/timeline.ts`, `assertAssignable` in `lib/record-owner.ts`, `addNotification` in `lib/notifications.ts`, `listActiveCustomFields` in `lib/custom-fields.ts` and the reminder runner in `lib/reminders.ts` call Prisma, because the `authenticate` middleware, several modules and the server's timer need them. | Code review |
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

Every response uses an envelope, except the OpenAPI document itself (see below) and a CSV export, which is a file ([CSV export](#csv-export)). An export that fails still answers with the error envelope.

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
| `PAYLOAD_TOO_LARGE` | 413 | The JSON body is over the 100 kB limit set in `app.ts` (12 MB on the import routes), or the CSV file in an import is over 5 MB. |
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
- **The one raw-document exception:** `/api/v1/openapi.json` returns the bare OpenAPI document, not `{ data, meta }`, because OpenAPI tools need the bare document. No other JSON response may skip the envelope.
- **A CSV download** is documented with `csvResponse(description)` from `lib/openapi.ts`: `text/csv` content and the two headers every export sends.
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

PostgreSQL is reached through Prisma 7 with the `pg` driver adapter ([`backend/src/lib/prisma.ts`](../../backend/src/lib/prisma.ts)). Only services import it. The schema is [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma); its models are `User`, `Session`, `AuthToken` (invite and password-reset links), the owned records `Lead`, `Contact`, `Company` and `Opportunity`, `PipelineStage` (see [The pipeline and opportunities](#the-pipeline-and-opportunities)), `TimelineEntry` (see [The timeline](#the-timeline)), `Task` (see [Tasks](#tasks)), `Notification` (see [Notifications](#notifications)) and `CustomField` (see [Custom fields](#custom-fields)). Ids are UUID version 7 (`@default(uuid(7))`). The generated client goes to `backend/src/generated/prisma/`, which is git-ignored and recreated by `prisma generate`.

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

**Check-then-write rules.** A rule of the form "check, then write on the strength of the check" (only one first Admin, never zero Admins) is not safe when two requests arrive together. Run it in `prisma.$transaction(async (tx) => { await lockUserAdministration(tx); ... })`; `lockUserAdministration` in `lib/prisma.ts` takes a PostgreSQL advisory lock that makes the second transaction wait for the first. `users.test.ts` proves it with simultaneous requests. `lockPipelineStages` is the same lock for changes to the pipeline stages (never fewer than one open stage, no two stages with one name), and `lockCustomFields` for changes to the custom field definitions (no two fields of a record type with one label, never more than 30 in use). A third guard is a conditional write as the first statement of the transaction: converting a lead starts with `updateMany({ where: { id, status: { not: "CONVERTED" } } })`, so a second request waits on the row and then changes nothing. A unique column is the other guard: catch Prisma error `P2002` and turn it into the right `AppError`, as `users.service.ts` does for `EMAIL_IN_USE`.

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

Leads, contacts, companies and opportunities are **owned records** (a task is not; see [Tasks](#tasks)): each has an `ownerId` column and an `owner` relation to `User`, and who may see or change one depends on the caller's role and on who the owner is (ROLE-04 to ROLE-08).

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
- **Shared field rules** for owned records are in [`lib/record-fields.ts`](../../backend/src/lib/record-fields.ts): `optionalText(max)` (trimmed, `""` stored as null), `optionalEmailSchema`, `moneySchema` (a number from 0 with at most two decimals, sent and answered as a JSON number), `daySchema` (a day such as `"2026-11-15"`), `momentSchema` (an exact moment with its offset, such as `"2026-11-15T09:30:00Z"` or `"2026-11-15T15:00:00+05:30"`), `followUpBodySchema` (see [Reminders](#reminders)), `recordLinkSchema` (`{ id, name }`, how one record names another), `recordIdParamsSchema`, `recordOwnerSchema` and `deletedResponseSchema`. Use them instead of writing the rule again.
- A new owned model names its columns `ownerId` / `owner` so that `visibleRecords` fits without change, uses `onDelete: Restrict` on the owner (users are never deleted), and has its rows deleted in `resetRecords()` in `backend/test/helpers.ts`.

## List endpoints

Every list that can grow (leads, contacts, companies, opportunities, tasks) has the same query string and the same `meta`, defined once in [`backend/src/lib/list-query.ts`](../../backend/src/lib/list-query.ts):

| Query | Meaning | Default |
| --- | --- | --- |
| `search` | Free text, up to 100 characters. Every word must match one of the columns the module chooses, case-insensitively. | none |
| `sort` | One of the fields the module allows. | chosen by the module |
| `order` | `asc` or `desc`. | `desc`, or `asc` when the module says so (a list that opens sorted by name) |
| `page` | 1 or more. | 1 |
| `pageSize` | 1 to 100. | 25 |
| filters | Named after the field (`status`, `source`, `ownerId`, `companyId`, `contactId`, `stageId`, `industry`, `assigneeId`), added by the module. | none |
| `cf.<field id>...` | Custom field filters, on the four record lists; see [Custom fields](#custom-fields). | none |

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
- A list with one fixed order (a timeline, the activity feed, a user's notifications) takes only the paging half: start from `pageQuerySchema` instead of `listQuerySchema(...)`.
- A list that can be exported keeps its query in one private function that takes the page window (`findLeads(actor, query, filters, fields, window)`); the list calls it with `pageWindow(query)` and the export with `exportWindow`, so the two can never disagree. See [CSV export](#csv-export).

## The timeline

Every dated thing that happens to a record is one row in **one table**, `TimelineEntry`: a conversation, a note, and the entries the system writes itself (`CREATED`, `STATUS_CHANGE`, `ASSIGNMENT`). A record page therefore reads a single ordered stream (`GET /leads/:id/timeline`, `/contacts/:id/timeline`, `/companies/:id/timeline`, `/opportunities/:id/timeline`), and the team activity feed (`GET /activity`) reads the same rows. The shared pieces are in [`backend/src/lib/timeline.ts`](../../backend/src/lib/timeline.ts); the routes are in [`modules/timeline/`](../../backend/src/modules/timeline/) and [`modules/activity/`](../../backend/src/modules/activity/).

| Column | Meaning |
| --- | --- |
| `kind` | `CONVERSATION`, `NOTE`, `CREATED`, `STATUS_CHANGE` or `ASSIGNMENT`. |
| `conversationType` | `CALL`, `MEETING`, `EMAIL` or `MESSAGE`; only for a conversation. |
| `body` | What was discussed, or the note. `null` for system entries. |
| `details` | JSON for system entries. A lead's status change: `{ from, to }`, plus `{ reason, note }` when it was marked lost, or `{ contact, company, opportunity }` (each `{ id, name }` or null) when it was converted. An opportunity's stage change: `{ from, to, fromKind, toKind }` with the stages' names as they were and their kinds, plus `{ reason }` when it was closed. An assignment: `{ fromOwner: { id, name }, toOwner: { id, name } }`. The `CREATED` entry of a record made by converting a lead: `{ fromLead: { id, name } }`; of a record made by a CSV import: `{ import: true }`. |
| `occurredAt` | When it happened: chosen by the user for a conversation (not more than 5 minutes ahead), the time of writing for everything else. Timelines sort by it, newest first, then by `createdAt`, then by `id`. |
| `authorId` | Who wrote it: always the signed-in user, from the session. |
| `leadId`, `contactId`, `companyId`, `opportunityId` | The record: one nullable column per record type, and exactly one of them is set on every entry; the check constraint `TimelineEntry_one_record` makes the database refuse anything else. Code does not name these columns: it passes a `RecordRef`, `{ type, id }` with the type `"lead"`, `"contact"`, `"company"` or `"opportunity"`, and `recordColumn(record)` in `lib/timeline.ts` turns it into the column. |

The rules, each pinned in `timeline.test.ts`:

- **Entries are permanent (CONV-05).** There is no update and no delete route, and no code path changes a row after it is written. `addTimelineEntry(tx, entry)` is the only code that writes the table, with `addCreatedEntries(tx, ...)` beside it for the `CREATED` entries of an import (one insert for a whole batch), and both only insert. Never add a `PATCH`, `PUT` or `DELETE` for an entry; a correction is a new note.
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
- **Custom field values are not carried over.** A lead's custom fields are its own definitions, not the contact's, the company's or the opportunity's, so the new records start without values, also when one of their fields is required. The lead keeps its own.
- **The lead keeps its history.** No timeline row is copied or moved. The lead becomes `CONVERTED` with `convertedAt` and the ids of what it became, and stays readable with its timeline. Its `STATUS_CHANGE` entry names the contact, company and opportunity; the `CREATED` entry of each record the conversion made carries `details.fromLead`. An existing contact or company gets no entry.
- **The link is in the API both ways:** a lead answers with `convertedTo: { contact, company, opportunity }` (null until it is converted), a contact and an opportunity with `convertedFromLead`. Each is `{ id, name }`, or null when there is none or the caller may not see it.
- **A converted lead is final.** `PATCH`, mark-lost, delete and a second convert answer `409 LEAD_CONVERTED`. It can still be read, reassigned, and written on (conversations and notes). A lost lead must be reopened before it can be converted (`VALIDATION_FAILED`, `details: null`).
- If any step fails, nothing is kept: `leads.test.ts` makes the third timeline entry fail and finds no contact, company or opportunity and an unconverted lead.

## Time zones

Times are stored and answered in UTC (`"2026-11-15T09:30:00.000Z"`), and a request sends an exact moment with its offset (`momentSchema`). "Today" and "this month" are different moments for different people, so the routes that count by day (`GET /tasks`, `GET /tasks/summary`, `GET /dashboard/me`, `GET /dashboard/team`) take the viewer's time zone as the query parameter **`tz`**: an IANA name such as `Asia/Kolkata`, checked by `timeZoneSchema`, `UTC` when it is left out, and `VALIDATION_FAILED` on `tz` when it is not a time zone. The web app sends the browser's zone. Nothing about a user's zone is stored.

[`backend/src/lib/time-zone.ts`](../../backend/src/lib/time-zone.ts) turns a zone into moments with the time zone data built into Node, without a library: `todayIn(tz, now)` gives `{ day, start, end }` (the viewer's calendar day, its first moment and the first moment of the next day), `startOfDay(tz, day, addDays)` the moment a day starts, clock changes included. `time-zone.test.ts` pins them with fixed dates. A test of a route cannot fake the clock ([testing](testing.md#backend-tests)); `zoneOnAnotherDay()` in `backend/test/helpers.ts` picks a zone where it is another calendar day than in UTC right now.

## Tasks

A task ([`modules/tasks/`](../../backend/src/modules/tasks/)) is something to do, for one person (`assignee`), by a moment (`dueAt`, optional). It is `OPEN` or `DONE`, and it may belong to **at most one record** (a lead, a contact, a company or an opportunity) or to none: `record` is `{ type, id, name }` or null. The table has one nullable column per record type, like `TimelineEntry`, and the check constraint `Task_one_record` refuses a second one.

A task is **not an owned record**. Who may see one follows the assignee and the person who made it (`visibleTasks` in `tasks.service.ts`):

| Role | Sees |
| --- | --- |
| Admin, Read-only | every task (a Read-only user changes nothing: `FORBIDDEN`) |
| Sales Manager | tasks assigned to them or made by them, and tasks assigned to a user whose `managerId` is the manager |
| Sales Rep | tasks assigned to them or made by them |

- **Whoever may see a task may change, complete, reopen and delete it.** Outside the caller's reach is `NOT_FOUND`, as for a record. Deleting is a soft delete.
- **The assignee** must be someone the caller may give work to, the same people as `assignableUsers(actor)`: a Sales Rep only themselves, a Sales Manager themselves and their team, an Admin any active user who is not Read-only. Anyone else is `VALIDATION_FAILED` on `assigneeId`. On `PATCH` only a *new* assignee is checked. The default is the caller.
- **The record** must be one the caller may see (`VALIDATION_FAILED` on `record.id` otherwise, exactly like an id that does not exist). A task answers with `record: null` when the reader may not see its record or the record was deleted; the task itself stays. The `recordType` + `recordId` filter (sent together) never matches a record the caller cannot see.
- **Status** changes only through `POST /tasks/:id/complete` and `/reopen`, which set and clear `completedAt`. Completing a task that is done, or reopening an open one, answers with the task as it is.
- **A task writes nothing on its record's timeline**, on create or on complete: the timeline is the history of what was discussed, and a record's tasks are read with the list filter.
- **When someone else gives a user a task** (create or a new assignee on `PATCH`), the assignee gets a `TASK_ASSIGNED` notification in the same transaction. Nobody is told about a task they gave themselves.
- **Due buckets** (the `due` filter, `GET /tasks/summary` and the dashboard) go by the viewer's calendar day (see [Time zones](#time-zones)): `overdue` is due before their today began, `today` is due within it, `upcoming` is due after it, `none` has no due date. The four never overlap. The filter is independent of `status`; the summary counts the caller's **own open** tasks, which means assigned to them.
- The list sorts by `dueAt` (the default, soonest first, tasks without one last in both directions), `createdAt` or `title`, and searches the title.

## Reminders

One mechanism serves a task's reminder and the follow-up on a lead or an opportunity (TASK-03 to TASK-05), in [`backend/src/lib/reminders.ts`](../../backend/src/lib/reminders.ts): a time on the row, and beside it the time the reminder fired.

| On | Time | Fired | Set with | Goes to |
| --- | --- | --- | --- | --- |
| `Task` | `reminderAt` | `reminderSentAt` | `reminderAt` in `POST /tasks` and `PATCH /tasks/:id` | the assignee |
| `Lead` | `followUpAt` (+ `followUpNote`, up to 500 characters) | `followUpNotifiedAt` | `PUT /leads/:id/follow-up` `{ at, note }` | the owner |
| `Opportunity` | the same | the same | `PUT /opportunities/:id/follow-up` `{ at, note }` | the owner |

- **`PUT .../follow-up`** replaces the follow-up: `at` is a moment or null, and `at: null` clears the time and the note. A converted lead answers `LEAD_CONVERTED`, and a lost lead or a closed opportunity `VALIDATION_FAILED` with `details: null`, when a time is set (the reminder would never fire); clearing always works. It writes nothing on the timeline. `followUpAt` and `followUpNote` are part of the `Lead` and `Opportunity` answers, and both lists sort by `followUpAt`.
- **The runner.** `runDueReminders(now)` finds the rows whose time is at or before `now` and that have not fired. For each it claims the row (one `UPDATE ... WHERE <fired> IS NULL`, the conditional write of [Check-then-write rules](#prisma-and-the-database)), writes the notification with `addNotification` in the same transaction, and then sends the email. `startReminderLoop()` calls it once a minute; it is started by `server.ts` after the API listens, never by `createApp`, and does nothing when `NODE_ENV` is `test`. There is no queue and no cron library.
- **It fires once.** Because of the claim, two API processes running at the same moment send one notification and one email between them (`reminders.test.ts` runs three at once). The claim is raw SQL so that `updatedAt` does not move: the record was not edited.
- **Moving the time arms it again.** A write that changes the time clears the "fired" column; saving the same time again (a form saved without touching it) does not.
- **What does not fire:** a done or deleted task, a deleted, converted or lost lead, a deleted or closed opportunity, and anything of a deactivated user. The reminder stays armed, so it fires on the next run after that stops being true (the task is reopened, the user is reactivated).
- **Email** goes through [`sendMail`](#email): the notification's title as the subject, its body, and a link built from `APP_URL`. It is sent after the notification is committed, so a mail server that fails, or email that is off, loses nothing: the failure is logged by the mailer and the email is not retried. One reminder that fails never stops the others.
- A time in the past is accepted and fires on the next run. One run handles at most 200 reminders of each kind; the rest wait a minute.

## Notifications

A notification is a message for one user inside the app: `{ id, kind, title, body, link, readAt, createdAt }`. `addNotification(tx, ...)` in [`backend/src/lib/notifications.ts`](../../backend/src/lib/notifications.ts) is the only code that writes one, and it takes the transaction client so that a notification is written together with what it reports.

| Kind | When | `title` | `body` | `link` |
| --- | --- | --- | --- | --- |
| `TASK_REMINDER` | a task's reminder comes due | `Reminder: <task title>` | the task's description, or null | `/tasks?open=<task id>` |
| `LEAD_FOLLOW_UP` | a lead's follow-up comes due | `Follow up with <lead name>` | the follow-up note, or null | `/leads/<lead id>` |
| `OPPORTUNITY_FOLLOW_UP` | an opportunity's follow-up comes due | `Follow up on <opportunity name>` | the follow-up note, or null | `/opportunities/<opportunity id>` |
| `TASK_ASSIGNED` | someone else assigns the user a task | `<name> assigned you a task` | the task's title | `/tasks?open=<task id>` |

- `link` is a path in the web app, never a full address; the helpers are `notificationLinks`. Only the three reminder kinds are also emailed.
- The routes ([`modules/notifications/`](../../backend/src/modules/notifications/)) only ever reach the caller's own rows, whatever the role: `GET /notifications` (newest first, paged, `unread=true` leaves out the read ones), `GET /notifications/unread-count` (`{ count }`), `POST /notifications/:id/read` (another user's is `NOT_FOUND`; one already read keeps its first `readAt`) and `POST /notifications/read-all` (`{ marked }`). Marking as read is not a change to a record, so a Read-only user may do it.
- A new kind is a new value in the `NotificationKind` enum and in `notificationKindSchema`, plus an `addNotification` call in the transaction that does the thing.

## The dashboard

[`modules/dashboard/`](../../backend/src/modules/dashboard/) stores nothing: every figure is counted from the records when it is asked for. Deleted records never count.

**`GET /dashboard/me?tz=`** (DASH-01) is for every signed-in user and is about the caller's **own** work: records they own and tasks assigned to them. That is the same for every role, so a Sales Manager's or an Admin's page does not include their team, and a rep can never see another rep's numbers here (DASH-03). A Read-only user owns nothing and gets zeros.

| Field | What it counts |
| --- | --- |
| `openLeads` | Own leads with the status `NEW`, `CONTACTED` or `QUALIFIED`: `total`, and `byStatus` with all three statuses. |
| `pipeline` | Own open opportunities per open stage, in pipeline order (every open stage is listed): `count` and `totalValue` per stage, and the `totalValue` of all. |
| `tasks` | Own open tasks: `overdue`, `today`, `upcoming` (see [Tasks](#tasks)). |
| `tasksDue` | Up to 10 own open tasks that are overdue or due today, the longest overdue first, each a full `Task`. |
| `followUps` | Up to 10 own open leads and open opportunities whose `followUpAt` is before the end of today, the longest overdue first: `{ type, id, name, at, note }`. One stays listed after its reminder fired, until the follow-up is cleared or moved. |
| `wonThisMonth` | Own opportunities in the Won stage whose `closedAt` is in the viewer's current month: `count` and `totalValue`. |

**`GET /dashboard/team?from=&to=&tz=`** (DASH-02) is for Admins and Sales Managers; a Sales Rep and a Read-only user get `FORBIDDEN`, as on the activity feed. An Admin gets a row for every user who is not Read-only, a Sales Manager for themselves and the users whose `managerId` is the manager. A deactivated person is listed only while one of their figures is not zero. Rows are in name order; `totals` adds up the rows.

`from` and `to` are days in the zone `tz`, both included. Left out, `from` is the first day of the viewer's current month and `to` is their today. A `to` before `from`, or a range of more than 366 days, is `VALIDATION_FAILED` on `to`. The answer repeats the days in `range`.

| Figure | What it counts |
| --- | --- |
| `leadsCreated` | Leads the person created (`createdById`) with `createdAt` in the range, whoever owns them now. |
| `leadsHandled` | Leads the person owns now that have at least one `CONVERSATION` or `STATUS_CHANGE` timeline entry with `occurredAt` in the range, written by anyone. Each lead counts once. |
| `conversationsLogged` | `CONVERSATION` timeline entries the person wrote with `occurredAt` in the range, on any kind of record. |
| `opportunitiesWon`, `opportunitiesLost` | Opportunities the person owns now that are in the Won or the Lost stage with `closedAt` in the range. |
| `wonValue` | The summed `value` of those won opportunities. |
| `openPipelineValue` | The summed `value` of the open opportunities the person owns **now**; the range does not apply. |
| `overdueTasks` | Open tasks assigned to the person that are overdue **now** (due before the viewer's today); the range does not apply. |

## Email

[`backend/src/lib/mailer.ts`](../../backend/src/lib/mailer.ts) is the only place that sends email. `sendMail({ to, subject, text })` returns `true` when the message was handed to the SMTP server and `false` when email is off (`SMTP_HOST` not set) or sending failed; it never throws, so a request never fails because of email (D-10). `isMailConfigured()` says whether email is on. Messages are plain text. In the Compose stack the API sends to [Mailpit](http://localhost:8025), a local inbox, so no email leaves your machine. When an invite or reset link cannot be emailed, the API returns the link to the Admin instead (`LinkResult` in the users module).

## Custom fields

An Admin can add fields to leads, contacts, companies and opportunities (CF-01 to CF-03). The **definitions** are rows of `CustomField` ([`modules/custom-fields/`](../../backend/src/modules/custom-fields/)); the **values** live on the records, in a JSONB column `customFields` on each of the four tables, keyed by the field's id. Everything the four record services need is in [`backend/src/lib/custom-fields.ts`](../../backend/src/lib/custom-fields.ts).

**A field** is `{ id, recordType, label, type, options, required, position, archived, createdAt, updatedAt }`. `recordType` is `LEAD`, `CONTACT`, `COMPANY` or `OPPORTUNITY`; `type` is `TEXT`, `NUMBER`, `DATE` or `DROPDOWN`. Both are fixed when the field is created.

| Route | Who | Rules |
| --- | --- | --- |
| `GET /custom-fields?recordType=&includeArchived=` | any signed-in user | In order: by record type, then the Admin's order. `recordType` left out lists every type. Archived fields only with `includeArchived=true`, which is `FORBIDDEN` for anyone but an Admin; they follow the fields in use. |
| `POST /custom-fields` `{ recordType, label, type, options?, required? }` | Admin | Added last. Answers with the field (201). |
| `PATCH /custom-fields/:id` `{ label?, options?, required? }` | Admin | Only the keys sent change. `options` replaces the whole list. |
| `PUT /custom-fields/order` `{ recordType, ids }` | Admin | `ids` is every field **in use** of the record type exactly once. Answers with every field of that record type, archived ones last. |
| `POST /custom-fields/:id/archive`, `/restore` | Admin | Archiving hides the field everywhere and keeps its values; restoring puts it last among the fields in use. Either one on a field already in that state answers with it unchanged. |
| `DELETE /custom-fields/:id` | Admin | Only an archived field (`VALIDATION_FAILED`, `details: null` otherwise). Removes the field and its value from every record, in one transaction; the records' `updatedAt` does not move. |

- A label is 1 to 60 characters without control characters, unique among the fields of its record type **archived ones included**, whatever the case (`VALIDATION_FAILED` on `label`). So restoring a field never collides, and an export never has two custom columns with one name.
- A `DROPDOWN` has 1 to 50 options of 1 to 100 characters, each once whatever the case; any other type has none (`VALIDATION_FAILED` on `options`).
- A record type has at most 30 fields in use (`MAX_ACTIVE_CUSTOM_FIELDS`); archived fields do not count. The 31st, by create or restore, is `VALIDATION_FAILED` with `details: null`.
- Every change runs in a transaction that starts with `lockCustomFields(tx)`.
- `position` orders the fields of a record type. Lists come in that order already; the numbers may have gaps (after an archive), so a client never computes with them.

**Values.** Each of the four records answers with `customFields: { [fieldId]: string | number | null }`: one key for **every field in use** of its record type, and `null` where the record has no value. Create and `PATCH` take the same object.

| Type | Stored and answered as | Refused |
| --- | --- | --- |
| `TEXT` | a string, trimmed, up to 500 characters | anything that is not a string |
| `NUMBER` | a JSON number | a string (`"12"`), anything not finite |
| `DATE` | a day as a string, `"2026-11-15"` | any other format, a day that does not exist |
| `DROPDOWN` | one of the options, exactly as spelled | anything else |

- **`PATCH` merges key by key**: keys that are not sent keep their value; `null` or `""` clears one.
- **Every problem is reported at once** as `VALIDATION_FAILED` with one detail per field, `path: "customFields.<field id>"`. An id that is not a field in use of this record type (unknown, archived, or another record type's) is refused the same way.
- **`required`** is checked on create (the field must be sent with a value) and on `PATCH` only for the keys that are sent (a required field cannot be cleared). A record from before the field existed, or before it became required, stays editable. The other write routes (assign, mark lost, stage, close, reopen, follow-up, convert) never look at custom fields.
- **Removing a dropdown option** does not touch the records that hold it. They keep answering with the stored value, which is then not in `options`; it can be sent back unchanged in a `PATCH` (a form that sends every field still saves), but it cannot be chosen for another record, or again once the record moved off it.
- **An archived field** is left out of every response and refused in every request, but its values stay in the column and come back when it is restored.
- A service gets its values through three helpers: `customFieldsForCreate(fields, input)`, `customFieldsForUpdate(recordType, column, input)` (undefined when the request sent none, so Prisma leaves the column alone) and `toApiCustomFields(fields, column)`. `checkCustomFieldValues` under them is pure, which is what lets the import check thousands of rows against one read of the fields.

**Filtering (CF-03).** The four lists (`GET /leads`, `/contacts`, `/companies`, `/opportunities`), their exports and the opportunities board take custom field filters in the query string, named after the field's id. All bounds are inclusive.

| Field type | Query | Matches |
| --- | --- | --- |
| `TEXT` | `cf.<field id>=north` | the value contains the text, whatever the case |
| `DROPDOWN` | `cf.<field id>=Gold` | the value is exactly that option |
| `NUMBER` | `cf.<field id>.min=10`, `cf.<field id>.max=20` | the value is at least / at most the number |
| `DATE` | `cf.<field id>.from=2026-01-01`, `cf.<field id>.to=2026-12-31` | the day is on or after / on or before |

- A record without a value for the field never matches. Several filters narrow the list together, with the search and the other filters.
- An id that is not a field in use of this record type, a form that does not fit the field's type (`.min` on a text field), a value that is not a number or a day, a value over 100 characters and a parameter sent twice are `VALIDATION_FAILED` with `path` the parameter itself (`cf.<field id>.min`). A parameter sent **empty** is ignored, like a filter box that was cleared.
- The controller calls `parseCustomFieldFilters(req.query)` (shape only) and the service `customFieldWhere(fields, filters)`, which returns Prisma JSON filters to spread into the `AND` of the list's `where`. A field id reaches the query only after it matched a real field, and Prisma sends it and the value as parameters; `%` and `_` in a text filter are escaped like in a search. Nothing indexes the JSON values: the filter reads the rows the other conditions leave, which is fine for the tens of thousands of records this product is for.
- OpenAPI cannot list parameters whose names depend on data, so the filters are described in each list route's `description` (`CUSTOM_FIELD_FILTERS` in `lib/route-docs.ts`).

## CSV export

Every list a user can see can be downloaded as a CSV file (DATA-03): `GET /leads/export`, `/contacts/export`, `/companies/export`, `/opportunities/export` and `/tasks/export`. The shared pieces are in [`backend/src/lib/csv-export.ts`](../../backend/src/lib/csv-export.ts), on top of the CSV writer in [`lib/csv.ts`](../../backend/src/lib/csv.ts).

- **An export is the list.** It takes the list's query string (search, filters, custom field filters, `sort`, `order`) and applies the same visibility, through the same private function as the list (`findLeads`), with `exportWindow` instead of the page window. `page` and `pageSize` are accepted and ignored. Whoever can see the list can export it, a Read-only user included.
- **The response** is the file, not an envelope: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="leads-2026-11-15.csv"` (the viewer's today) and `X-Export-Truncated: true|false`. A plain link works, because a GET needs only the session cookie; CORS exposes both headers for a client that fetches the file instead.
- **At most 10,000 rows** (`EXPORT_ROW_LIMIT`). A longer list is cut off there, in the sort order asked for, and `X-Export-Truncated` is `true`; the user narrows the list with a filter to get the rest.
- **The file** is UTF-8 with a byte order mark (without it Excel garbles every accented letter), one header row, CRLF line ends. Headers are words ("First name", "Expected close date"). An owner, company, contact, stage, assignee and record is written by name, and only when the caller may see it, exactly as the list shows it. An enum is written as people read it (`COLD_CALL` is "Cold call"). Each custom field in use is one more column, headed by its label, after the record's own.
- **Times** are written as `2026-11-15 14:30` in the time zone `tz` (see [Time zones](#time-zones); UTC when left out); days stay `2026-11-15`.
- **Formula injection.** A text cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading apostrophe (`neutraliseFormula`), so no spreadsheet runs it; a number stays a number. See [security](security.md#csv-export-and-import). Always write a file for people with `writeSpreadsheetCsv`, never with `writeCsv` directly.
- **Adding an export:** register `GET /export` above `/:id` in the router, parse the list's query schema extended with `tz`, describe the columns as `ExportColumn<ApiRecord>[]`, and answer with `sendCsv(res, name, tz, buildCsvExport(columns, page))`. Document it with `csvResponse(...)`, and add the route to `ROUTES_WITHOUT_INPUT` in `endpoint-contract.test.ts` and to the table in `lib/csv-export.test.ts`.

## CSV import

Leads, contacts and companies can be imported from a CSV file (DATA-01, DATA-02), in [`modules/imports/`](../../backend/src/modules/imports/). The browser reads the file and sends its **text** in a JSON body; there is no file upload, so no multipart parser. Every role that may create records may import: a Read-only user gets `FORBIDDEN` on all three routes.

| Route | Answers |
| --- | --- |
| `GET /imports/fields?type=LEAD\|CONTACT\|COMPANY` | The fields a column can be mapped to: `[{ key, label, required, kind, options? }]`, the record's own first, then its custom fields in use (`key` is `cf:<field id>`). `kind` is `TEXT`, `EMAIL`, `NUMBER`, `DATE` or `DROPDOWN`. |
| `POST /imports/preview` `{ type, csv }` | `{ headers, sampleRows, rowCount, suggestedMapping }`: the column names, the first five data rows (one cell per header), the number of data rows, and for each header the key of the field it looks like, or null. Saves nothing. |
| `POST /imports` `{ type, csv, mapping, ownerId?, skipDuplicates?, createCompanies? }` | `{ total, created, skipped, failed, companiesCreated, errors, errorsTruncated, failedCsv }` (200). |

**The file.** Comma-separated, the column names in the first row, UTF-8 (a byte order mark is fine), any line ends. Empty rows are ignored, and empty columns after the last name too. The limits: the body may be 12 MB (`PAYLOAD_TOO_LARGE` from the body parser), the file 5 MB of UTF-8 text (`PAYLOAD_TOO_LARGE`, "The file is larger than 5 MB") and 5,000 data rows (`VALIDATION_FAILED` on `csv`). Also `VALIDATION_FAILED` on `csv`, each with its own message: an empty file, a first row without names, a column without a name, two columns with one name (whatever the case), no rows below the names, and a quoted cell that is never closed.

**The mapping** is `{ [header]: fieldKey | null }`; a header mapped to null, or left out, is not imported. Every problem is reported together as `VALIDATION_FAILED`: a header the file does not have, a key that is not a field of this record type, a field mapped twice (each on `mapping.<header>`), and a required field no column is mapped to (on `mapping`, one detail per field: `Map a column to "Last name"`). Required are the first and last name of a lead and a contact, the name of a company, and every required custom field.

**The rows.** Each row is checked on its own and saved or reported on its own; the import never fails as a whole because of a row.

- A row is checked with the **create route's own schema** (`createLeadBodySchema` and its siblings) and the custom field rules, so an import can store nothing the form could not. Cells are trimmed. An empty cell is no value.
- What the file writes differently from JSON: a number is `1200.50` or `1,200.50`; a date is `2026-11-15`; a dropdown option and a lead's source match whatever the case ("cold call", `COLD_CALL`); a lead without a source gets `OTHER`. A leading apostrophe before `=`, `+`, `-` or `@` is removed, so an export, or the failed rows file, imports back unchanged.
- **Row numbers are a spreadsheet's:** the header row is row 1, the first data row is row 2, and empty rows and rows with line breaks inside a cell count as a spreadsheet counts them.
- `errors` lists the failed rows in file order: `{ row, values: { [header]: cell }, messages: [{ field, column, message }] }`, where `field` is the label of the field ("Email") and `column` the header it was read from; both are null for a problem with the whole row (more cells than columns, a row that could not be saved). It holds at most 200 rows (`errorsTruncated` says there are more).
- `failedCsv` is **every** failed row as a file: the file's own columns and the reasons in a last column "Error" (reused when the file has one from an earlier attempt), written like an export (byte order mark, formulas neutralised). It is null when nothing failed. The user corrects it and imports it again.
- **Saving** runs in batches of 100, one transaction each: the records, their `CREATED` timeline entries (`details: { import: true }`, written with `addCreatedEntries`) and any company they need, all or none. If a batch fails for a reason no check foresaw, its rows are saved one at a time, so only the row at fault is reported ("This row could not be saved").
- **Ownership.** The records belong to the caller, or to `ownerId` when the caller may assign records to that user (`assertAssignable`, the rule of the create routes; `VALIDATION_FAILED` on `ownerId` otherwise). `createdById` is the caller.
- **A contact's company** (`companyName`): the contact is linked to the company the caller may see with that name, whatever the case (the oldest, if there are several). When there is none, a company is created, once per name per import, owned like the contacts; `companiesCreated` counts them. With `createCompanies: false` such a row fails instead. A company the caller cannot see is never linked.
- **`skipDuplicates`** (off unless sent) leaves out a row whose email (leads, contacts) or name (companies, whatever the case) a record the caller may see already has, or an earlier row of the same file; `skipped` counts them. A row without an email is never a duplicate. Without the flag nothing is compared.
- There is no import history: nothing is stored about an import except the records it made.
