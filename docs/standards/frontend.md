# Frontend standard

How the web app in `frontend/` is built: feature folders, the one slice pattern for loading data, the shared HTTP client, error handling, generated API types, styling and environment. The complete working example is the health feature, [`frontend/src/features/health/`](../../frontend/src/features/health/). **Copy it and rename; do not invent a new shape.** Each rule says what enforces it.

Related: [structure](structure.md), [backend](backend.md), [testing](testing.md).

## Folders (D-05, D-07)

- `frontend/src/features/<feature>/` holds everything for one feature: its components, slice, API calls, types and tests. The feature name matches the backend module name (see [structure](structure.md#the-mirror-rule)).
- Shared code lives in shared folders: `src/components/` (UI building blocks, including generated shadcn components in `src/components/ui/`), `src/lib/` (the HTTP client, helpers, generated schema) and `src/store/` (the Redux store).
- **Route files stay thin** (D-07). Files in `src/app/` only render a feature component; they contain no fetch, axios or store code. See [`frontend/src/app/page.tsx`](../../frontend/src/app/page.tsx), which does nothing except render `HealthStatus`.

## No RTK Query (D-06)

Data is loaded with Redux Toolkit `createAsyncThunk` and one shared axios instance. **RTK Query is not used. This is an owner decision and it must not be reintroduced** ([decision 0003](../decisions/0003-async-thunks-with-axios.md)). It is enforced: importing anything from `@reduxjs/toolkit/query` fails lint. Because thunks mean more hand-written code, every feature follows the one recipe below so they all look the same.

## The slice recipe

For a feature `leads` with a list endpoint, create the files below. The health versions are shown; replace "health" with your feature.

### 1. `leads.types.ts`: types come from the generated schema

Never hand-write a response type. Derive it from the OpenAPI types (see [Generating API types](#generating-api-types)), so a contract change becomes a compile error. From [`health.types.ts`](../../frontend/src/features/health/health.types.ts):

```ts
import type { components, paths } from "@/lib/api/schema";

export type Health = components["schemas"]["Health"];

// The body of a successful GET /health: { data, meta }.
export type HealthResponse =
  paths["/health"]["get"]["responses"]["200"]["content"]["application/json"];
```

### 2. `leads.api.ts`: plain functions that return unwrapped data

Functions call the shared `http` instance and return the `data` of the `{ data, meta }` envelope. They do not touch Redux. From [`health.api.ts`](../../frontend/src/features/health/health.api.ts):

```ts
export async function getHealth(): Promise<Health> {
  const response = await http.get<HealthResponse>("/health");
  return response.data.data;
}
```

### 3. `leads.slice.ts`: state, thunk and reducers

**State shape.** Every slice that loads data uses exactly these keys:

| Key | Type | Meaning |
| --- | --- | --- |
| `data` | the feature's type, or `null` | The last successfully loaded value. It is kept while a reload is running, so the screen shows the last good value instead of flashing empty. |
| `status` | `"idle"`, `"loading"`, `"succeeded"` or `"failed"` | Where the request is. |
| `error` | `ApiError` or `null` | Set when `status` is `"failed"`, cleared when a new request starts. |

**Thunk naming.** The action type string is `<feature>/<verb>` (`health/fetch`) and the constant is `<verb><Feature>` (`fetchHealth`).

**Loading condition.** Every thunk has a `condition` that skips the request while one is already running.

**Errors.** The axios interceptor has already turned every failure into an `ApiError`, so the thunk only forwards it with `rejectWithValue`. Declare `rejectValue: ApiError` through `createAsyncThunk.withTypes`. The fallback for a rejection without a payload is `UNKNOWN_ERROR`.

From [`health.slice.ts`](../../frontend/src/features/health/health.slice.ts):

```ts
type HealthState = {
  data: Health | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: ApiError | null;
};

const initialState: HealthState = { data: null, status: "idle", error: null };

export const fetchHealth = createAsyncThunk.withTypes<{
  state: RootState;
  rejectValue: ApiError;
}>()(
  "health/fetch",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      return await getHealth();
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while one is already in flight.
    condition: (_arg, { getState }) => getState().health.status !== "loading",
  },
);

const healthSlice = createSlice({
  name: "health",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchHealth.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchHealth.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.data = action.payload;
      })
      .addCase(fetchHealth.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload ?? {
          code: "UNKNOWN_ERROR",
          message: action.error.message ?? "Unexpected error",
          details: null,
        };
      });
  },
});

export const healthReducer = healthSlice.reducer;

export const selectHealth = (state: RootState) => state.health;
```

Export the reducer as `<feature>Reducer` and a selector `select<Feature>`. A thunk that takes an argument types it in place of `undefined`.

### 4. The component: typed hooks only

Components read and write the store only through `useAppDispatch` and `useAppSelector` from `@/store/hooks`. The raw `useDispatch`, `useSelector` and `useStore` from `react-redux` are **banned by lint** everywhere except `src/store/hooks.ts`, where the typed versions are built. From [`health-status.tsx`](../../frontend/src/features/health/health-status.tsx):

```tsx
const dispatch = useAppDispatch();
const { data, status, error } = useAppSelector(selectHealth);

useEffect(() => {
  void dispatch(fetchHealth());
}, [dispatch]);
```

Render values as React text nodes, never with `dangerouslySetInnerHTML`.

### 5. Register the reducer and add the route

Add the reducer in [`frontend/src/store/index.ts`](../../frontend/src/store/index.ts):

```ts
export const makeStore = () => configureStore({ reducer: { health: healthReducer } });
```

`makeStore` is a **factory**: there is no exported store instance. `StoreProvider` ([`store-provider.tsx`](../../frontend/src/store/store-provider.tsx)) creates one store per mount with `useState(makeStore)`, and every test builds its own with `makeStore()`. Server components never read the store.

Then add a thin route file under `src/app/` that renders the feature component.

### 6. Tests

Write a slice test and a component test, mocking at the feature's `*.api.ts` file. See [testing](testing.md#frontend-tests).

## One axios instance

All HTTP goes through `http` in [`frontend/src/lib/api/http.ts`](../../frontend/src/lib/api/http.ts). Importing `axios` anywhere else fails lint. The instance takes its base URL from the validated `env.NEXT_PUBLIC_API_URL`, has a 10 second timeout, and its response interceptor converts every failure into an `ApiError`:

```ts
export type ApiError = {
  code: ErrorCode | ClientErrorCode;
  message: string;
  details: unknown;
  requestId?: string;
};
```

`code` is either one of the server's error codes (generated from the OpenAPI document, see [backend](backend.md#error-codes-d-12)) or one of three codes the client produces itself when there is no usable server error body: `NETWORK_ERROR` (the server could not be reached), `TIMEOUT`, and `UNKNOWN_ERROR` (anything else, including a response that is not the error envelope). `requestId` is the `X-Request-Id` response header when present. Slices and components never inspect axios errors.

## Error handling in components

The user interface decides what to show by switching on `error.code`, never by parsing `error.message` (D-12). Known codes get a fixed client string; any other code falls through to a default that shows the code and the server message. From `health-status.tsx`:

```tsx
function describeError(error: ApiError): string {
  switch (error.code) {
    case "SERVICE_UNAVAILABLE":
      return "The API is running but the database is unavailable";
    case "NETWORK_ERROR":
      return "The API cannot be reached";
    default:
      return `${error.code}: ${error.message}`;
  }
}
```

Show `error.requestId` when it is present: it lets someone find the request in the API log.

## Generating API types

The frontend never imports backend code (D-02). Types come from the committed API document:

```sh
pnpm --dir backend openapi:generate   # after changing a route or schema
pnpm --dir frontend api:types         # writes frontend/src/lib/api/schema.d.ts
```

Commit both generated files. `schema.d.ts` is generated: never edit it by hand. ESLint and Prettier both skip it. To check it is current, run `api:types` and then `git diff --exit-code -- frontend/src/lib/api/schema.d.ts`; any difference means the committed file is out of date.

## Styling (D-08)

Styling is **Tailwind CSS 4 with shadcn/ui** (`radix` base, `nova` preset, configured in [`frontend/components.json`](../../frontend/components.json)). Use Tailwind classes; do not add inline styles or another styling system. Pages must work on phone, tablet and desktop: start from the narrow layout and widen with `sm:` and larger prefixes, as `health-status.tsx` does.

Phase 1 installs and configures this and uses a single shadcn component (`Button`) on the status page. **The shared component set is designed and built in Phase 2.** Generated shadcn code lives in `src/components/ui/` and is excluded from the strict lint rules; do not hand-edit it unless you also accept that the next regeneration will overwrite your change. When adding a component with the shadcn tool, use the locally installed one and review any change it makes to `package.json` or the lockfile before committing; dependencies are pinned and reviewed by the owner.

## Environment

[`frontend/src/env.ts`](../../frontend/src/env.ts) validates the environment with Zod. It is imported by `next.config.ts`, so both `next dev` and `next build` fail at start-up and name the bad variable (for example `NEXT_PUBLIC_API_URL: Invalid URL`). Import `env` from `@/env`; reading `process.env` anywhere else fails lint. Only variables whose name starts with `NEXT_PUBLIC_` belong here, because they are written into the browser bundle: **never put a secret in the frontend environment.** The one variable today is `NEXT_PUBLIC_API_URL`, listed in [`frontend/.env.example`](../../frontend/.env.example). Each variable is read as a literal `process.env.NAME` in `loadEnv`, because Next only inlines literal reads into browser code.

## What enforces what

| Rule | Enforced by |
| --- | --- |
| Typed hooks only | ESLint `no-restricted-imports` (react-redux hooks) in `frontend/eslint.config.mjs` |
| One axios instance | ESLint `no-restricted-imports` (`axios`), with `src/lib/api/http.ts` the only exception |
| No RTK Query | ESLint `no-restricted-imports` pattern `@reduxjs/toolkit/query*` |
| `process.env` only in `src/env.ts` | ESLint `no-restricted-properties` |
| kebab-case file names, import order, no `any` | ESLint `unicorn/filename-case`, `simple-import-sort`, `no-explicit-any` |
| API types match the contract | Generated `schema.d.ts` plus `tsc` (`health.types.test.ts` pins the types) |
| State machine of a slice | Slice tests (`health.slice.test.ts`) |
| Thin route files, slice shape, error switch | Code review, with the health feature as the reference |

`pnpm --dir frontend check` runs ESLint (zero warnings allowed), the Prettier check and the strict TypeScript check.
