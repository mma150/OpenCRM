# Testing standard

Both apps use **Vitest** (D-13). The backend tests the real API with **supertest** against a real PostgreSQL database; the frontend tests with **Testing Library**. Every new backend module and frontend feature ships with tests, and the test step in CI runs them. The examples to copy are the health tests:

- Backend: [`health.test.ts`](../../backend/src/modules/health/health.test.ts), [`error-handler.test.ts`](../../backend/src/middleware/error-handler.test.ts), [`openapi.test.ts`](../../backend/src/lib/openapi.test.ts), [`env.test.ts`](../../backend/src/env.test.ts)
- Frontend: [`health.slice.test.ts`](../../frontend/src/features/health/health.slice.test.ts), [`health-status.test.tsx`](../../frontend/src/features/health/health-status.test.tsx), [`health.types.test.ts`](../../frontend/src/features/health/health.types.test.ts), [`env.test.ts`](../../frontend/src/env.test.ts)

Related: [backend](backend.md), [frontend](frontend.md), [structure](structure.md).

## Commands

Run from the repository root.

| What | Command |
| --- | --- |
| Backend tests | `pnpm --dir backend test` |
| Frontend tests | `pnpm --dir frontend test` |
| Backend lint, format and types (includes test files) | `pnpm --dir backend check` |
| Frontend lint, format and types (includes test files) | `pnpm --dir frontend check` |

Test files sit beside the code they test and are named `*.test.ts` (backend, under `src/`) or `*.test.ts` / `*.test.tsx` (frontend, under `src/`). Files with any other name are not picked up.

**No lint disabling in tests.** Test files are held to the same strict ESLint rules as the rest of the code (zero warnings). Do not add `eslint-disable` comments, `@ts-ignore` or `any`. Where a tool returns `any` (a supertest response body), declare an interface for the shape and cast once, as the health tests do:

```ts
interface HealthEnvelope {
  data: {
    status: string;
    database: { connected: boolean; serverTime: string };
  };
  meta: Record<string, unknown>;
}
// ...
const body = response.body as HealthEnvelope;
```

## Backend tests

- **Real database, no mocking of Prisma.** Tests exercise the real stack: `request(createApp())` from supertest, controller, service, Prisma, PostgreSQL. The only deliberate fake is making Prisma fail (a Vitest spy) to prove the `SERVICE_UNAVAILABLE` path.
- **The `opencrm_test` database.** The development database `opencrm` is never used by tests. Before the tests run, [`backend/test/global-setup.ts`](../../backend/test/global-setup.ts) connects to the server's `postgres` maintenance database, creates `opencrm_test` if it does not exist, and runs `prisma migrate deploy` against it. It is safe to run repeatedly, including after an interrupted run. [`backend/vitest.config.ts`](../../backend/vitest.config.ts) then forces `DATABASE_URL` to the test database for every test, so a test cannot reach `opencrm` by accident.
- **Where the server comes from.** The setup uses the `DATABASE_URL` in your shell if there is one; otherwise it reads `backend/.env`, then `backend/.env.example` (localhost port 5432). So on default ports you only need PostgreSQL running: `docker compose up -d --wait db`. If you changed `DB_PORT`, export a matching `DATABASE_URL` in your shell (for example `postgresql://opencrm:opencrm@localhost:5440/opencrm`); do not edit `.env.example`. A CI job must provide a PostgreSQL service and set `DATABASE_URL` the same way.
- **One database, so one file at a time.** Test files run sequentially (`fileParallelism: false`). A test that writes rows must clean up after itself, or use data nothing else depends on.
- **Helpers.** [`backend/test/helpers.ts`](../../backend/test/helpers.ts) has what most module tests need: `createTestApp()` (an app whose auth rate limits are lifted, so a test file can sign in as often as it likes), `resetDatabase()`, `resetRecords()` (every record, timeline entry, task and notification, keeping the users and the pipeline stages; for `beforeEach`), `resetPipelineStages()` (the six default stages again, for a test that changes the pipeline), `createUser({ role, invited, isActive })`, `signInAs(app, user)` (a supertest agent with the session cookie and the `Origin` header the origin check requires), and `captureMail()`. Email is off in tests; `captureMail()` stands in for a working mail server with a Vitest spy and collects the messages. Like the database failure in the health test, it is a deliberate fake at the edge of the system, not a mock of the code under test.
- **Time.** To test an expiry or a lock, move the timestamp in the database (set `expiresAt` or `lockedUntil` in the past) rather than faking the clock. Code that depends on the moment takes it as an argument where it can (`runDueReminders(now)`). For "today" in a route, `utcNoon(daysFromToday)` gives a moment safely inside a UTC day, and `zoneOnAnotherDay()` a time zone where it is another calendar day right now, with a moment that falls in a different due bucket there (see [Time zones](backend.md#time-zones)).
- **Pattern.** Build the app once with `createApp()` (or `createTestApp()`), call `prisma.$disconnect()` in `afterAll`, check the status and the exact envelope keys (`data` and `meta`, or `error`), and never assert on a stack trace or internal text.

### What every new backend module must test

1. Each route's success response: the status, the `{ data, meta }` shape, and the payload.
2. Validation: bad input returns `400` with the code `VALIDATION_FAILED` and `details` that name the offending field.
3. Each expected failure the service raises with `AppError`: the status and the stable error code.
4. Permissions. For a module of owned records that means every rule in [Record access](backend.md#record-access) for each of the four roles on every route, including `NOT_FOUND` (not `FORBIDDEN`) for a record outside the caller's reach and a Sales Manager's team boundary. Copy `leads.test.ts`.
5. For a list: search, each filter, each sort, paging and `total`, and that a filter cannot show a record the caller may not see (see [List endpoints](backend.md#list-endpoints)).
6. That the module's paths are in the OpenAPI document: run `pnpm --dir backend openapi:generate` and commit `backend/openapi/openapi.json`; the drift test in `openapi.test.ts` fails otherwise.

Changes to cross-cutting code (error mapping, request ids, logging, environment) keep their own tests in `src/middleware/`, `src/lib/` and `src/env.test.ts`.

## Frontend tests

- **Environment.** `jsdom`, with Testing Library and `@testing-library/jest-dom` matchers registered in [`frontend/vitest.setup.ts`](../../frontend/vitest.setup.ts). Vitest globals are off, so import `describe`, `it`, `expect` and `vi` from `"vitest"`; the setup file registers Testing Library's `cleanup` itself. [`frontend/vitest.config.ts`](../../frontend/vitest.config.ts) sets `NEXT_PUBLIC_API_URL` so `src/env.ts` parses without a `.env` file. Tests make no network calls.
- **Mock at the feature's API file.** Use `vi.mock("./health.api")` and control `getHealth` (resolve, reject with an `ApiError`, or a promise you resolve by hand). Never mock axios or the store.
- **Use a real store.** Build a fresh store with `makeStore()` in every test; render components inside react-redux's `Provider store={makeStore()}`. The helper [`renderWithStore`](../../frontend/src/test/render-with-store.tsx) does both and returns the store and a `userEvent` session; pass `{ me: adminUser }` to start signed in.
- **The router is replaced for every test.** `vitest.setup.ts` swaps `next/navigation` for [`src/test/navigation-mock.ts`](../../frontend/src/test/navigation-mock.ts). Assert on `mockRouter.replace` to see where a component navigated, and call `setMockLocation("/login", "next=%2Fprofile")` to set the current path and query string. By default `push` and `replace` only record the call; call `followNavigation()` in a test whose component reads back the address it wrote (a list with URL-synced state), and they then move the mock location too. It is reset after each test.
- **Forms and mutations.** Test what the user sees: the field message for a `VALIDATION_FAILED` detail, the sentence above the form for every other code the screen can get, and that nothing was sent when the client-side check fails. See `login-form.test.tsx` and `users-page.test.tsx`.
- **Pattern.** Slice tests dispatch the thunk on a store and assert the state; component tests render and use Testing Library queries (`screen.findByText`, `userEvent`).

### What every new frontend feature must test

1. The slice state machine: initial `{ data: null, status: "idle", error: null }`, then `loading`, then `succeeded` with the payload, then `failed` keeping the `ApiError` code and message.
2. That no second request starts while one is loading (the thunk's `condition`).
3. The component: the loading text, the loaded data, and one test per error code the component handles, plus the default branch.
4. The type contract where it matters, using `expectTypeOf` as in `health.types.test.ts`; `tsc` (part of `check`) enforces it.

Known noise: `vitest run` in the frontend prints a Vite warning, "ESM syntax in a file loaded as CommonJS (vitest.config.ts)". It is harmless and the tests still run; silencing it needs a change to the package manifest that is still an open owner decision.
