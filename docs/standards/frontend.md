# Frontend standard

How the web app in `frontend/` is built: feature folders, the one slice pattern for loading data, forms and mutations, the shared HTTP client, error handling, generated API types, the app frame, the shared components, styling and environment. The complete working example is the health feature, [`frontend/src/features/health/`](../../frontend/src/features/health/). **Copy it and rename; do not invent a new shape.** Each rule says what enforces it.

Related: [structure](structure.md), [backend](backend.md), [testing](testing.md).

## Folders (D-05, D-07)

- `frontend/src/features/<feature>/` holds everything for one feature: its components, slice, API calls, types and tests. The feature name matches the backend module name (see [structure](structure.md#the-mirror-rule)).
- Shared code lives in shared folders: `src/components/` (UI building blocks, including generated shadcn components in `src/components/ui/`), `src/lib/` (the HTTP client, helpers, generated schema) and `src/store/` (the Redux store).
- **Route files stay thin** (D-07). Files in `src/app/` only render a feature component; they contain no fetch, axios or store code. See [`frontend/src/app/status/page.tsx`](../../frontend/src/app/status/page.tsx), which does nothing except render `HealthStatus`. Route files live in two groups: `src/app/(auth)/` for signed-out pages and `src/app/(app)/` for signed-in pages (see [The app frame](#the-app-frame)).

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

**A slice that loads more than one thing** holds the same three keys once per thing, each under its own name, with a selector for each. [`leads.slice.ts`](../../frontend/src/features/leads/leads.slice.ts) is the example: `list` (one page of leads) and `current` (the lead open on the detail or edit page).

[`activity.slice.ts`](../../frontend/src/features/activity/activity.slice.ts) is a second one: `list` (one page of the feed) and `authors` (the people in its Person filter). A request that only **adds to** what is loaded ("Load more" on a timeline) is not a second thing: it gets a small `more: { status, error }` beside the three keys, so the list on screen never goes back to its loading state (see [`timeline.slice.ts`](../../frontend/src/features/timeline/timeline.slice.ts)).

**A list with a query** (search, filters, sort, page) adds two rules to the recipe, both in `leads.slice.ts`:

- `list` also keeps the `query` it was last asked for. `data` is the page of records plus the `meta` of the response (`page`, `pageSize`, `total`).
- The `condition` skips a request only while **the same query** is already loading. A different query is let through, and the reducers ignore an answer whose query is no longer the current one, so a slow old answer can never replace a newer one. `current` does the same with its `id`.

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
const appReducer = combineReducers({
  auth: authReducer,
  health: healthReducer,
  users: usersReducer,
});
```

`makeStore` wraps `appReducer` so that logging out, or the session ending, resets **every** slice to its initial state: nothing loaded for one account can be seen by the next person to sign in. A new slice gets this for free by being added to `appReducer`.

`makeStore` is a **factory**: there is no exported store instance. `StoreProvider` ([`store-provider.tsx`](../../frontend/src/store/store-provider.tsx)) creates one store per mount with `useState(makeStore)`, and every test builds its own with `makeStore()`. Server components never read the store.

Then add a thin route file under `src/app/` that renders the feature component.

### 6. Tests

Write a slice test and a component test, mocking at the feature's `*.api.ts` file. See [testing](testing.md#frontend-tests).

## Forms and mutations

The slice recipe above is for **loading** data. Anything that **changes** data (sign in, invite a user, save a profile) follows this second recipe. The examples to copy are [`login-form.tsx`](../../frontend/src/features/auth/login-form.tsx) and [`invite-user-dialog.tsx`](../../frontend/src/features/users/invite-user-dialog.tsx).

1. **The form is react-hook-form with a Zod schema** (`zodResolver`). Shared field rules (name, email, the password rule) come from [`src/lib/validation.ts`](../../frontend/src/lib/validation.ts). Every row is a [`FormField`](../../frontend/src/components/shared/form-field.tsx), and the form is `<form noValidate>` so the messages are ours, not the browser's. `FormField` hands its control the value with the type of the field that was named, so a form may hold a checkbox or a list beside its text.
2. **The mutation is a thunk** made with `createAppThunk` from [`src/store/thunk.ts`](../../frontend/src/store/thunk.ts), named `<feature>/<verb>` like any other. It calls the API function and forwards the `ApiError` with `rejectWithValue`. It has **no** `pending` or `rejected` reducer: a mutation does not touch the slice's `status` or `error`, which belong to loading. Its `fulfilled` reducer puts the result in `data` when the result belongs there (the signed-in user, the changed user in the list). A mutation on a list then **reloads the list** with the query it was last loaded with, so the change shows where it belongs under the current filters and sort.
3. **The form awaits `.unwrap()`** inside `onSubmit`, so react-hook-form's `isSubmitting` drives the button and the rejection arrives in a `catch`:

   ```tsx
   async function onSubmit(values: Values) {
     setFormError(null);
     try {
       await dispatch(login(values)).unwrap();
     } catch (error) {
       setFormError(applyServerError(error as ApiError, form.setError, ["email", "password"]));
     }
   }
   ```

4. **Errors land in one of two places.** [`applyServerError`](../../frontend/src/lib/form-errors.ts) puts each `VALIDATION_FAILED` detail (`{ path, message }`) on the form field with that name and returns `null`; for any other code, or a detail that names no field on this form, it returns the sentence to show in the [`FormAlert`](../../frontend/src/components/shared/form-alert.tsx) above the form.
5. **Success is a toast** (`toast.success` from `sonner`) or a visible success state, never silence.

**Two mutations are optimistic:** moving an opportunity to another stage of the board, and ticking a task off, both show before the API has answered. Each has its own rules: see [The pipeline board](#the-pipeline-board) and [Tasks](#tasks). Do not make another mutation optimistic without a reason as strong as dragging a card or ticking a checkbox.

**A form that is a page, not a dialog** (New lead, Edit lead) follows the same five steps. The example is [`lead-form.tsx`](../../frontend/src/features/leads/lead-form.tsx): one component creates when it gets no record and edits when it gets one.

- The fields sit in `grid grid-cols-1 gap-4 md:grid-cols-2`: one column on phones, two from `md`. Keep the `grid-cols-1`: it gives the column a zero minimum width, so a long value cannot push the form wider than its card.
- Optional text is `""` in the form, and is left out (create) or sent as `null` (edit) in the request. A number field is text in the form and a JSON number in the request. An edit sends **only the fields that changed**.
- The four record forms end with the record type's custom fields; see [Custom fields](#custom-fields).
- Cancel and "after saving" go back to where the user came from. The page that links to the form passes its own address as `?from=` (`withReturnTo` and `useCurrentUrl` from [`src/lib/return-to.ts`](../../frontend/src/lib/return-to.ts)), and the form page reads it with `useReturnTo(fallback)`, which accepts only a path inside this app, like `?next=`.
- A user whose role may not use the form gets a `PageState` saying so instead of the form.

A call whose result never enters the store (forgot password, reset password, reading an invite) may call its `*.api.ts` function directly from the component, with the same `try`/`catch`. Tests mock at the `*.api.ts` file either way.

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

The instance sets `withCredentials: true`, because the session is an httpOnly cookie and the API is on another origin. **A missing or expired session is handled in one place:** when a response carries the code `UNAUTHENTICATED`, the interceptor calls the handler registered with `setUnauthenticatedHandler`. `StoreProvider` registers it to dispatch `sessionExpired()`, which resets the store, and `AuthGate` then sends the user to `/login`. The check is on the **code, never on HTTP 401**: a wrong password (`INVALID_CREDENTIALS`) is also a 401 and must not sign anyone out. No component or slice redirects to the login page itself.

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

The words for the codes that many screens share (sign-in failures, `FORBIDDEN`, `EMAIL_IN_USE`, `LAST_ADMIN`, the network codes, and the "try again in N minutes" hint from `details.retryAfterSeconds`) live in one function, `describeApiError` in [`src/lib/api/error-messages.ts`](../../frontend/src/lib/api/error-messages.ts). Add a new shared code there, not in a component; a feature keeps its own switch only for wording that is specific to its screen, as the health page does.

## Generating API types

The frontend never imports backend code (D-02). Types come from the committed API document:

```sh
pnpm --dir backend openapi:generate   # after changing a route or schema
pnpm --dir frontend api:types         # writes frontend/src/lib/api/schema.d.ts
```

Commit both generated files. `schema.d.ts` is generated: never edit it by hand. ESLint and Prettier both skip it. To check it is current, run `api:types` and then `git diff --exit-code -- frontend/src/lib/api/schema.d.ts`; any difference means the committed file is out of date.

## The app frame

Every signed-in page is rendered inside the same frame, and every later module is added to it the same way.

**Route groups.** `src/app/(app)/layout.tsx` wraps its pages in `AuthGate` and `AppShell`; `src/app/(auth)/layout.tsx` wraps the signed-out pages in `GuestGate`. The root layout only provides the theme, the store and the toaster. Both group layouts put their pages inside `Suspense`, which Next.js requires for any page that reads the query string. A route with a parameter stays thin too: it awaits `params` and hands the value to the feature component as a prop (see `src/app/(app)/leads/[id]/page.tsx`).

- [`AuthGate`](../../frontend/src/features/auth/auth-gate.tsx) loads the current user once. Signed in: it renders the page. `UNAUTHENTICATED`: it goes to `/login?next=<path>`. Any other failure (the network, the server): it stays and offers Retry, it does not redirect.
- [`GuestGate`](../../frontend/src/features/auth/guest-gate.tsx) is the single place that decides where a user goes after signing in: to `?next=` when [`safeNextPath`](../../frontend/src/lib/safe-next.ts) accepts it (a path inside this app only), otherwise Home. Forms never navigate after sign-in themselves.
- A page for some roles only checks the role of the signed-in user and renders a `PageState` that says so (see [`users-page.tsx`](../../frontend/src/features/users/users-page.tsx)). This is for clarity only: the API is what enforces access.

**One nav config.** [`src/components/app-shell/nav-items.ts`](../../frontend/src/components/app-shell/nav-items.ts) is the single list of destinations. The sidebar, the bottom tab bar, its "More" menu and the top bar title are all drawn from it, so **a new module adds one line and touches nothing else**:

```ts
{ href: "/leads", label: "Leads", icon: Funnel, bottomTab: true },
```

The phone tabs are Home, Leads and Tasks, plus "More": the pages a sales person opens many times a day. A module that is not a phone tab is listed under "More" (Opportunities first, then Contacts, Companies, Profile), and a page for some roles only adds `roles`. Opportunities gave its tab to Tasks when tasks arrived: Home shows the pipeline stage by stage with a link into each stage, and the board is one tap further under "More". Profile is under "More" because it is also one tap away in the top bar's user menu at every width.

```ts
{ href: "/contacts", label: "Contacts", icon: Contact, bottomTab: false },
{ href: "/activity", label: "Activity", icon: History, roles: ["ADMIN", "SALES_MANAGER"], bottomTab: false },
```

| Key | Meaning |
| --- | --- |
| `href`, `label`, `icon` | Where it goes, what it is called, a `lucide-react` icon |
| `roles` | Who sees it; leave out for everyone |
| `bottomTab` | `true`: a tab in the phone's bottom bar. `false`: listed under "More". At most three tabs, so the bar is four with "More" (a test enforces this) |
| `group: "settings"` | Pins the item to the bottom of the sidebar, under Settings (Users, Pipeline, Custom fields) |

**Three widths, no drawer (D-13).**

| Width | Navigation |
| --- | --- |
| Phone, below `md` (768px) | No sidebar. A fixed bottom tab bar (icon and label, 64px tall) with a "More" tab that opens a menu holding every other destination, the theme switch and Log out |
| Tablet, `md` to `lg` (1024px) | The sidebar collapsed to icons, with tooltips |
| Desktop, `lg` and up | The full sidebar (240px) with the OpenCRM name |

The top bar shows the page title on the left (the OpenCRM name on phones, which have no sidebar) and, on the right, the notification bell (see [Notifications](#notifications)) and the user menu: Profile, Theme (Light, Dark, System) and Log out. The bell is in the top bar at every width, so `/notifications` is not in `nav-items.ts`; `pageTitle` names that page itself, and `/import`, which is reached from the lists. Do not add a slide-in drawer or shadcn's `sidebar` or `sheet` components; the owner chose the bottom tab bar instead.

**What a page gets from the frame.** Padding, a centred column, and enough bottom padding on phones that the tab bar never covers the last line (including the iPhone safe area). A page therefore starts directly with its `PageHeader` and never sets its own outer padding or `min-h-screen`.

## Shared components

Build screens from these, in [`src/components/shared/`](../../frontend/src/components/shared/), so lists, forms and states look and read the same in every module. Generated shadcn primitives stay in `src/components/ui/`.

| Component | Use it for |
| --- | --- |
| `PageHeader` | The page's `h1`, one line of help, and its main action button. A list passes `ListActions` before the button |
| `ListActions` | "Export CSV" and "Import" beside a list's "New" button: two buttons from `sm`, one "More actions" menu on a phone. See [Export and import](#export-and-import) |
| `CustomFieldsSection`, `CustomFieldsCard`, `CustomFieldFilterButton`, `CustomFieldFilterChips` | The custom fields of a record form, of a record page and of a list's filters. See [Custom fields](#custom-fields) |
| `ResponsiveList` | **Every list of records.** See below |
| `ListToolbar`, `ListPagination`, `useListUrlState` | The search box, filters and sort above a list, the paging row under it, and their state in the address. See [Lists with search, filters and paging](#lists-with-search-filters-and-paging) |
| `RecordList` | Everything under the toolbar of a list page: `ResponsiveList`, the two empty states, the stale-page note and `ListPagination`. See [Lists with search, filters and paging](#lists-with-search-filters-and-paging) |
| `RecordLayout`, `RecordHeader`, `RecordFact`, `DetailList`, `DetailItem`, `DetailLink`, `EmptyValue`, `NotesCard`, `BackLink` | The page of one record. See [The record page](#the-record-page) |
| `RecordLoader`, `NoWriteAccess` | Loading, "not found" and a failed load for a record page; and what a Read-only user gets instead of a form |
| `RecordRowMenu`, `RecordMoreMenu` | The actions menu of a list row, and the "More actions" menu in a record page's header |
| `ReassignRecordDialog`, `DeleteRecordDialog` | The two dialogs every owned record has. See [What owned records share](#what-owned-records-share) |
| `RecordPicker`, `RecordFilter` | Choosing one record out of thousands by searching for its name, in a form or as a list filter. A feature wraps them: `CompanyPicker`, `ContactPicker`, `LeadPicker`, `OpportunityPicker`. See [The record pickers](#the-record-pickers) |
| `FollowUp` | The follow-up reminder of a lead or an opportunity: the strip under the record's header and its dialog. See [Follow-ups](#follow-ups) |
| `SegmentedControl` | A short row of choices where exactly one is on: the filter above a timeline, the two modes of a form, the Board / List switch, the two columns of a record page on a phone. Each choice is a button with `aria-pressed`; on a narrow screen the choices share the width instead of scrolling |
| `PageState`, `PageLoading`, `PageError` | Nothing to show, no access, loading, and a failed load with the request id and Retry |
| `FormField` | Every form row: label, control, hint and error, wired for screen readers |
| `SelectControl` | A select inside a `FormField`; `placeholder` shows while the value is `""` |
| `FormAlert` | The message above a form for an error that is not about one field |
| `PasswordInput` | Any password box (it has the show/hide button); pass `autoComplete` |
| `RoleBadge`, `StatusBadge` | A role or a user status. Labels come from [`src/lib/user-labels.ts`](../../frontend/src/lib/user-labels.ts); never print the raw enum value |
| `CopyLinkField` | A link the user has to pass on by hand |

A feature keeps the labels and the badge for its own enums beside its code, in the same style: [`lead-labels.ts`](../../frontend/src/features/leads/lead-labels.ts) and [`lead-status-badge.tsx`](../../frontend/src/features/leads/lead-status-badge.tsx). Dates and money are written with the functions in [`src/lib/format.ts`](../../frontend/src/lib/format.ts), the one place that fixes the locale and the currency: `formatDate`, `formatDateTime`, `formatTime`, `formatCurrency` and `formatNumber` (a plain number, `12,500.5`); `formatDay` for a calendar day without a time (an expected close date, `"2026-11-15"`), which is the same day for every viewer and must not go through `formatDate`; `formatRelativeDate` ("Today", "3 days ago", then the date) and `formatRelativeTime` (the "2 hours ago" hint beside a recent moment); `formatNearDateTime` for a due date or a reminder ("Today, 2:00 PM", "Tomorrow, 10:00 AM", then the date and time) and `isPast` for "is it late"; `formatDayHeading` for the days of a feed; and `toDateInputValue` / `toDateTimeInputValue` for native date inputs. Dates are always shown in the viewer's time zone. A date the user picks is a native `<input type="date">` or `datetime-local` in the shared `Input`; there is no calendar component.

### ResponsiveList: the one list pattern (D-16)

A list is a **table from `md` up and stacked cards below**, with the same loading skeletons, empty state and error state (with Retry) at every width. It takes the slice's three keys directly:

```tsx
<ResponsiveList
  label="Users"
  items={data?.users ?? null}
  status={status}
  error={error}
  getKey={(user) => user.id}
  columns={columns}
  renderCard={(user) => <UserCard user={user} />}
  rowActions={(user) => <UserActionsMenu user={user} />}
  isDimmed={(user) => user.status === "DEACTIVATED"}
  empty={{ title: "No users yet" }}
  onRetry={() => void dispatch(fetchUsers())}
/>
```

- **It never scrolls sideways.** The table has a fixed layout and its cells clip, so a cell must make long text shrink: wrap it in `min-w-0` and `truncate`. Give narrow columns a width class (`className: "w-36"`); columns without one share the rest.
- A column with `hideBelow: "lg"` is dropped on tablets, and one with `hideBelow: "xl"` also on a small laptop, where the sidebar leaves the table about 720px. Put what it showed into the card as well.
- `rowActions` is rendered in both layouts: the last table cell, and the top right corner of the card.
- Both layouts are in the page at once and CSS shows one, so a component test looks inside `screen.getByRole("table")`.

### Lists with search, filters and paging

Every list that can be searched, filtered, sorted or paged is built from the same pieces around `ResponsiveList`. The examples to copy are [`leads-page.tsx`](../../frontend/src/features/leads/leads-page.tsx), [`contacts-page.tsx`](../../frontend/src/features/contacts/contacts-page.tsx) and [`companies-page.tsx`](../../frontend/src/features/companies/companies-page.tsx). The opportunities list is the same pattern split over two files, because its page also has a board: [`opportunities-page.tsx`](../../frontend/src/features/opportunities/opportunities-page.tsx) owns the address and the toolbar, [`opportunity-list.tsx`](../../frontend/src/features/opportunities/opportunity-list.tsx) the `RecordList`.

**1. `useListUrlState`: the list state lives in the address.** Search text, filters, sort and page are query-string parameters (`/leads?search=acme&status=NEW&sort=name&order=asc&page=2`), so a list view can be reloaded, sent to a colleague and returned to with Back. Declare what the list keeps once, as a constant outside the component:

```ts
const LIST_URL: ListUrlConfig<"status" | "source" | "ownerId", LeadSort> = {
  // Each filter and the values it accepts; null accepts anything (an id).
  filters: { status: LEAD_STATUSES, source: LEAD_SOURCES, ownerId: null },
  sorts: ["name", "company", "status", "createdAt", "updatedAt"],
  defaultSort: "createdAt",
  defaultOrder: "desc",
};

const { state, isFiltered, setSearch, setFilter, setSort, setPage, clearFilters } =
  useListUrlState(LIST_URL);
```

- `state` is `{ search, filters, sort, order, page }`; `""` means "not set". Build the API query from it with `useMemo` and load the list in an effect that depends on that query.
- Defaults are left out of the address, so the plain address is the plain list. A value that is not allowed (an unknown status, `page=abc`) falls back to its default instead of breaking the list.
- Every change except `setPage` goes back to page 1. The address is **replaced**, not pushed, so typing a search does not fill the browser history.
- `setFilters({ range: "custom", from, to })` changes several filters in one step, for controls that belong together. Two `setFilter` calls in a row would both start from the same address, and the second would undo the first.
- `keep: ["view"]` in the config names other parameters of the page that every change leaves in the address. The opportunities page uses it for its Board / List switch (`?view=list`), which is not list state: it is not reset by "Clear filters" and does not count as a filter.
- `customFilters: true` makes every `cf.` parameter part of the list state: `state.custom` holds them as they are in the address (`{ "cf.<field id>.min": "10" }`), `setCustom(next)` replaces them all in one step, and they count for `isFiltered` and are cleared by `clearFilters`. See [Custom fields](#custom-fields).
- `isFiltered` is true when the search box or a filter narrows the list. It chooses between the two empty states: "No leads yet" with the create action, or "No leads match your filters" with a **Clear filters** button (`clearFilters`). `RecordList` (below) does this for you.

**2. `ListToolbar`: search, filters and sort.**

```tsx
<ListToolbar
  search={{ value: state.search, placeholder: "Search by name", maxLength: 100, onChange: setSearch }}
  filters={[
    {
      label: "Status",
      allLabel: "All",
      value: state.filters.status,
      options: leadStatusOptions,
      onChange: (value) => {
        setFilter("status", value);
      },
    },
  ]}
  sort={{ value: `${state.sort}:${state.order}`, options: sortOptions, onChange: changeSort }}
/>
```

- The search box waits until typing has paused (300 ms) before it reports, trimmed, so the list is not reloaded on every key.
- `search` is optional: a list with nothing to search by text (the activity feed) leaves it out and gets the selects alone.
- A filter is a select whose first choice switches it off (`allLabel`); it reports `""` for that choice. When "off" is really a default (the feed's "Last 7 days"), name the default in `allLabel`: it is then left out of the address like any other default. Leave a filter out of the array when it has nothing to offer this user (the Owner filter for someone who only sees their own records).
- `extra` is for a filter that is not a select. The contacts list puts `CompanyFilter` there: a company is searched for, not picked from a select, because there can be thousands (see [The record pickers](#the-record-pickers)).
- The Owner filter of a list of owned records comes from `useOwnerFilter(value, onChange)` in [`use-owner-filter.ts`](../../frontend/src/features/users/use-owner-filter.ts). It loads the people the user may assign records to and returns the filter, or nothing for a Sales Rep and for anyone with fewer than two choices: `filters={[...ownFilters, ...ownerFilter]}`.
- Sort is one select whose values name a field and a direction (`"name:asc"`).
- `more` is a control after the sort order: the "More filters" button of a list with custom fields.
- On phones the search box takes its own line and the selects sit two to a row; from `sm` they wrap in a row; from `xl` everything is on one line. It never scrolls sideways.

**3. `ListPagination`: "Showing 26–50 of 64", Previous and Next.** Give it the `meta` of the list response and `setPage`. It renders nothing for an empty list. `pageRange(page, pageSize, total)` is the arithmetic, exported for the one thing a list must do itself: when the current page turns out to be past the end (its last record was deleted, or the address was edited), go to the last page that exists.

**4. `RecordList`: the three above, put together.** A list page of records (leads, contacts, companies) does not wire `ResponsiveList`, the empty states and `ListPagination` by hand. It hands [`RecordList`](../../frontend/src/components/shared/record-list.tsx) the slice's list and what `useListUrlState` returned:

```tsx
<RecordList
  label="Contacts" // the table's name for screen readers
  plural="contacts" // "No contacts yet", "No contacts match your filters"
  items={data?.contacts ?? null}
  meta={data}
  status={status}
  error={error}
  getKey={(contact) => contact.id}
  columns={columns}
  renderCard={(contact) => <ContactCard contact={contact} />}
  rowActions={(contact) => <RecordRowMenu name={contact.name} viewHref={...} ... />}
  isFiltered={isFiltered}
  onClearFilters={clearFilters}
  emptyDescription="Add your first contact to keep track of your conversations."
  createAction={canWrite ? newContactButton : undefined}
  page={state.page}
  onPageChange={setPage}
  onRetry={() => void dispatch(fetchContacts(query))}
/>
```

It draws the table and cards, the right empty state, the note that a failed reload left the last page on screen, the paging row, and it steps back from a page past the end. The page keeps what is its own: the header, the toolbar, the columns, the card and the row menu. A list that is not a table of records (the activity feed) still uses the three pieces directly.

### The record page

The page of one record (a lead, a contact, a company, an opportunity) is laid out by [`record-layout.tsx`](../../frontend/src/components/shared/record-layout.tsx). The examples are [`lead-detail-page.tsx`](../../frontend/src/features/leads/lead-detail-page.tsx), [`contact-detail-page.tsx`](../../frontend/src/features/contacts/contact-detail-page.tsx) and [`company-detail-page.tsx`](../../frontend/src/features/companies/company-detail-page.tsx).

```tsx
<BackLink href="/leads" label="Back to leads" />
<RecordLayout
  header={
    <>
      <RecordHeader title={lead.name} badge={badge} meta={facts} actions={actions} />
      {access.canWrite ? <LogConversationButton record={record} recordName={lead.name} /> : null}
    </>
  }
  main={<Timeline record={record} canWrite={access.canWrite} refreshKey={lead.updatedAt} />}
  aside={details} // the narrow column (320px): the Details and Notes cards
/>
```

- **`RecordHeader`** is the record's name as the `h1` with its status badge, one line of facts (`RecordFact`: an icon and a few words), and the actions. Keep the actions to a few compact controls: the main ones as buttons and everything else, including anything destructive, in one "More actions" menu. They wrap under the name on phones, so nothing needs sideways scrolling.
- **Two columns from `lg`, one at a time below.** The wide column is the record's timeline; the narrow one holds its cards (Details, Notes). On phones and tablets a `SegmentedControl` under the header ("Timeline" / "Details", from `mainLabel` and `asideLabel`) shows one column at a time, timeline first, so the details are one tap away instead of a long scroll past the history. A new section is another card in `aside`; the page itself is not rearranged.
- **A list of the record's own is `extra`.** A contact's page passes its opportunities as `extra={{ label: "Opportunities", content: <RecordOpportunities ... /> }}`; a company's page passes a list of two, its contacts and its opportunities. From `lg` they sit above the timeline in the wide column; below `lg` each gets a button of its own between the other two ("Timeline" / "Contacts" / "Opportunities" / "Details"). Four buttons are the most a phone holds: a fifth section belongs in `aside`. Keep such a card short: [`company-contacts.tsx`](../../frontend/src/features/contacts/company-contacts.tsx) and [`record-opportunities.tsx`](../../frontend/src/features/opportunities/record-opportunities.tsx) show ten records and link to the list, filtered by this record, for the rest.
- **What must be seen at every width goes under the header**, not in `aside`, which a phone keeps behind the "Details" button: the outcome of a closed opportunity (won or lost, the reason, the date), the stage stepper, the "Converted" banner of a lead with its links to the contact, company and opportunity it became, and the follow-up reminder of a lead or an opportunity (see [Follow-ups](#follow-ups)).
- **The Tasks card is the first card of `aside` on all four record pages** (`RecordTasks`, see [Tasks](#tasks)). It is in `aside`, not `extra`, so that it sits in the same place on every record: a company already has two `extra` sections, and a fifth button does not fit a phone.
- **The Custom fields card** comes after Details on all four record pages: `<RecordCustomFields recordType="LEAD" values={lead.customFields} />`. It draws nothing for a record type without custom fields.
- **`DetailList` and `DetailItem`** are the label and value pairs inside a card. Show `EmptyValue` (`—`) for a missing value, and use `DetailLink` for another record, an email (`mailto:`) and a phone number (`tel:`). `NotesCard` is the record's own free text. A company's website goes through `WebsiteLink` in [`company-website.tsx`](../../frontend/src/features/companies/company-website.tsx): a value typed without a scheme opens over `https://`, in a new tab, and anything that does not pass the API's website rule is shown as text, never as a link.
- **Loading, not found and errors** are drawn by `RecordLoader`. Each feature wraps it in a small loader of its own that dispatches the request ([`lead-loader.tsx`](../../frontend/src/features/leads/lead-loader.tsx)), which the detail and edit pages share. A record that does not exist and a record the user may not see get the same "not found" page, because the API does not say which it is.
- **Only offer what the API will allow.** `recordAccess(role)` in [`src/lib/record-access.ts`](../../frontend/src/lib/record-access.ts) says what the signed-in role may do with an owned record (`canWrite`, `canReassign`); leads, contacts, companies and opportunities follow the same rule. A record can add a rule of its own on top: a converted lead keeps Reassign and its timeline form, and loses Edit, the status control, Convert, Mark as lost and Delete (`isConverted` in `lead-labels.ts`), because the API answers those with `LEAD_CONVERTED`. Hide every other control, in the list's row menu and on the record page alike. This is for clarity; the API is what enforces it.

### What owned records share

Leads, contacts, companies and opportunities are all owned records: one owner, the same access rule, the same actions. What they would otherwise each repeat lives in shared components, and a feature only says what the record is called and hands over its own request. **A new kind of owned record uses these; it does not copy a dialog or a menu.**

| Piece | What the feature gives it |
| --- | --- |
| `RecordRowMenu` (list row) and `RecordMoreMenu` (record header), in [`record-menus.tsx`](../../frontend/src/components/shared/record-menus.tsx) | A handler for each action the role may use (`editHref`, `onReassign`, `onDelete`); an action without a handler is left out. Items only this record has (a lead's "Mark as lost") go in as `children` |
| `ReassignRecordDialog` in [`record-dialogs.tsx`](../../frontend/src/components/shared/record-dialogs.tsx) | `record` (its name and owner), `noun` ("contact") and `onReassign={(ownerId) => dispatch(assignContact({ id, ownerId })).unwrap()}` |
| `DeleteRecordDialog`, same file | `name`, the sentence that says what is lost and what is kept (`description`), and `onDelete={() => dispatch(deleteContact(id)).unwrap()}` |
| `RecordLoader` and `NoWriteAccess` in [`record-loader.tsx`](../../frontend/src/components/shared/record-loader.tsx) | The `current` part of the slice, `noun` and where "Back" goes; `plural` for the Read-only state of a form page |
| `RecordList`, `useOwnerFilter`, `recordAccess` | See above |

The dialogs follow [Forms and mutations](#forms-and-mutations) themselves: the rejection is shown in the dialog, which stays open, and success is a toast. A feature keeps one small `<feature>-dialogs.tsx` that maps "which dialog is open" to these components ([`contact-dialogs.tsx`](../../frontend/src/features/contacts/contact-dialogs.tsx)); a dialog only one record has (a lead's "Mark as lost", an opportunity's "Close as won / lost") stays in that file, or in a file of its own when it is long (`convert-lead-dialog.tsx`). A delete that leaves something behind says so in `description`: deleting a company warns that its contacts stay but lose the link.

These are components with props, not a framework: each slice, form and page is still written out per feature following the recipes above, so a contributor can read one feature top to bottom.

### The record pickers

[`RecordPicker`](../../frontend/src/components/shared/record-picker.tsx) chooses one record out of any number: a button that shows the current record and opens a dialog with a search box and the matches, twenty at a time by name. It never loads every record, so it is used wherever a company or a contact is chosen; do not build a select of companies or contacts.

It is one component for every kind of record. A feature says what its record is in a `RecordPickerKind` (what it is called, its icon, how to search it and how to find one by id) and exports a thin picker of its own, so nothing is copied: [`CompanyPicker` and `CompanyFilter`](../../frontend/src/features/companies/company-picker.tsx) search `GET /companies?search=`, [`ContactPicker` and `ContactFilter`](../../frontend/src/features/contacts/contact-picker.tsx) search `GET /contacts?search=` and show each contact's company under the name; [`LeadPicker`](../../frontend/src/features/leads/lead-picker.tsx) and [`OpportunityPicker`](../../frontend/src/features/opportunities/opportunity-picker.tsx) do the same for leads and opportunities. **A picker for another record is a new `RecordPickerKind`, about thirty lines.** A form that links to a record of any type (a task) offers a type select and then that type's picker: [`task-record-picker.tsx`](../../frontend/src/features/tasks/task-record-picker.tsx) is the table of the four.

```tsx
// In a form: the control of a FormField. The form keeps the id; the name is kept beside it.
<FormField control={control} name="companyId" label="Company">
  {({ id, onChange, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
    <CompanyPicker
      id={id}
      value={picked} // { id, name } | null
      onChange={(next) => {
        setPicked(next);
        onChange(next?.id ?? "");
      }}
      invalid={invalid}
      describedBy={describedBy}
    />
  )}
</FormField>

// Above a list: the Company filter, as ListToolbar's `extra`. `of` is what the list holds.
<CompanyFilter of="opportunities" companyId={state.filters.companyId} onChange={(id) => setFilter("companyId", id)} />
```

- In a form a button beside it clears the choice; in the dialog the first row does ("No company", "All companies").
- The search waits until typing has paused, an older answer never replaces a newer one, and the dialog has its own loading, empty ("No companies match ...") and error-with-Retry states. Its answers do not enter the store: nothing else shows them.
- The filter keeps only the id (it lives in the address) and asks the API for the name when the id did not come from the picker itself: after a reload, or from the "View all" link on a record's page.
- On a phone the dialog sits near the top of the screen, so the matches stay above the on-screen keyboard. Its list has a fixed height and scrolls inside, and long names wrap.
- A "new" form accepts the id of a record to start with in its address: `/contacts/new?companyId=`, `/opportunities/new?companyId=` or `?contactId=` (a contact brings its company along). The lookup is `usePreselectedRecord(param, enabled, lookup)` in [`src/lib/use-preselected-record.ts`](../../frontend/src/lib/use-preselected-record.ts); a record that is gone or out of reach is simply not filled in. An empty choice is left out of a create request and sent as `null` in an edit, which removes the link.
- A filter the toolbar has no room for all the time can show only when the address sets it: the opportunities list shows `ContactFilter` only for `?contactId=`, which the "View all" link on a contact's page sets, so the filter can be seen and switched off.

### The timeline

The dated history of a record (conversations, notes, and the entries the API writes when the record is created, changes status or changes owner) is one feature, [`src/features/timeline/`](../../frontend/src/features/timeline/). **It does not know what a lead, a contact, a company or an opportunity is.** A record page hands it a record reference, and all four mount the same components:

```tsx
const record: RecordRef = { type: "lead", id: lead.id }; // or "contact", "company", "opportunity"

<LogConversationButton record={record} recordName={lead.name} /> // in `header`, under RecordHeader
<Timeline record={record} canWrite={access.canWrite} refreshKey={lead.updatedAt} /> // in `main`
```

- **`Timeline`** is the card in the wide column: the filter (All, Conversations, Notes, Changes), the form that adds to it, the entries newest first, and "Load more". It has its own loading, empty and error-with-Retry states. Entries are permanent, so it shows no edit or delete control.
- **`canWrite`** is the feature's answer to "may this role change the record" (`leadAccess(me.role).canWrite`). Without it there is no form and no button: a Read-only user sees the history only.
- **`refreshKey`** is any value that changes when the record changes; pass the record's `updatedAt`. When it changes, the timeline loads again with the filter that is selected, so the entry for a new status or owner shows without a reload. Saving a conversation or a note does not need it: the saved entry is put into the list at once.
- **`LogConversationButton`** is for phones only and renders nothing from `md` up. It is the wide button under the header and the full-screen dialog it opens: large type buttons, a big text box, and a Save bar that stays above the on-screen keyboard (the dialog is as tall as `window.visualViewport`) and covers the bottom tab bar. From `md` up the same form, [`TimelineComposer`](../../frontend/src/features/timeline/timeline-composer.tsx), sits inline at the top of the `Timeline` card. Which of the two is rendered is decided by `useIsPhone()` from [`src/lib/use-is-phone.ts`](../../frontend/src/lib/use-is-phone.ts), not by CSS, because two copies of one form in the page would share their field ids. Use that hook only for this kind of choice; layout stays with the `md:` classes.
- **The form** is one react-hook-form for both modes (Conversation, Note), so what was typed stays when the mode is switched and when a save fails. It follows [Forms and mutations](#forms-and-mutations): the API's `occurredAt` error lands on the date field, its `summary` or `body` error on the text box, anything else above the form.
- **How a record type joins the timeline.** The record types are one table, `RECORD_TYPES` in [`record-types.ts`](../../frontend/src/features/timeline/record-types.ts):

  ```ts
  export const RECORD_TYPES = {
    lead: { label: "Lead", path: "leads" },
    contact: { label: "Contact", path: "contacts" },
    company: { label: "Company", path: "companies" },
    opportunity: { label: "Opportunity", path: "opportunities" },
  } as const;
  ```

  `label` is what the record is called in an entry ("Contact created") and `path` is where it lives, both in the API (`/contacts/:id/timeline`) and in the app (`/contacts/:id`). `RecordRef`, the API calls, the entry titles and the activity feed's links are all derived from it. **A new record type adds one line there**, and one line to `RECORD_TYPE_OF` in [`activity-labels.ts`](../../frontend/src/features/activity/activity-labels.ts) for the name the feed gives it (`OPPORTUNITY: "opportunity"`); TypeScript fails until that second line is there, as it did when the API began to write opportunity entries. Then its record page mounts `Timeline` and `LogConversationButton` as above. Nothing else in the feature changes. The API answers every record type's timeline routes with the same shapes, so the types in `timeline.types.ts` are derived once, from the lead's paths.
- **A record with a "Last contact"** (a lead, a contact, an opportunity) moves it forward in its own slice when `logConversation.fulfilled` arrives for it, checking `record.type` as well as the id (see `contacts.slice.ts`). A conversation on a company moves nothing.
- **Words for entries** (titles, conversation types, icons) are in [`timeline-labels.ts`](../../frontend/src/features/timeline/timeline-labels.ts) and [`timeline-entry-icon.tsx`](../../frontend/src/features/timeline/timeline-entry-icon.tsx), which the activity feed uses too. A status or lost reason inside an entry is written with `humanize` (`CHOSE_COMPETITOR` becomes "Chose competitor"), so the timeline needs no list of every record type's statuses. An opportunity's `STATUS_CHANGE` is told apart by its `toKind`: its `from` and `to` are the names of pipeline stages, which an Admin chooses, so they are shown as they are, and the kinds decide the words ("Stage changed: New → Proposal", "Closed as won", "Closed as lost", "Reopened in New"); its reason is a sentence someone wrote and is the entry's text, not part of the title. A `CREATED` entry with `details.fromLead` reads "Opportunity created from lead Marcus Chen".
- **Text a user wrote** is shown with `whitespace-pre-wrap wrap-anywhere`: line breaks are kept, and a long word or link wraps inside its card.

The team's view of the same entries is the activity feed, [`src/features/activity/`](../../frontend/src/features/activity/) at `/activity` (Admin and Sales Manager). It is a list with URL-synced filters like any other, without a search box, grouped under day headings; a date range is sent to the API as the first and last moment of the viewer's own days. Entries of every record type are mixed in it: each links to the page of its record (`recordHref`) and carries a badge that says what kind of record it is ("Lead", "Contact", "Company").

### The pipeline board

`/opportunities` shows the pipeline as a board or as a list; a `SegmentedControl` switches, and the choice is in the address (`?view=list`; the board is the default). The search text and the Owner filter are shared by the two views; changing the view drops what the board cannot show (stage, status, company, sort, page). The board is [`opportunity-board.tsx`](../../frontend/src/features/opportunities/opportunity-board.tsx), fed by `GET /opportunities/board` through the `board` part of the opportunities slice (`{ data, status, error, query }` like any list).

- **One column for each stage**, with the stage's count and total value from the API. They cover every opportunity in the stage; a column carries at most 50 cards and then says "Showing 50 of 132" with a link to the list filtered by that stage (`?view=list&stageId=`).
- **Three widths.** From `md` the open stages sit side by side, each with a width of its own, and scroll sideways **inside the board** when they do not fit: the page itself never scrolls sideways. Won and Lost are narrow columns pinned to the right edge (`sticky`), so they stay in reach while the open stages scroll; they show their count and total and link to the list, not their cards, which would pile up without end. Below `md` one stage shows at a time, chosen with a row of stage buttons that carry each stage's count (the row scrolls inside itself), and the cards are full width; there a closed stage shows its cards too.
- **Moving a card has two ways, and the menu is the complete one.** Every card has a "Move to stage" menu: the other open stages, then "Close as won" and "Close as lost" (a closed card has "Reopen"). It works with a keyboard and with a finger, and is the only way on a phone. On a wide screen a card can also be dragged to another column with the browser's own drag and drop (`draggable`, `onDragOver`, `onDrop`); there is no drag-and-drop library, and none may be added without the owner's approval. A feature that offers dragging must offer the same action as a menu or buttons too.
- **Won and Lost are never a plain move.** Dropping a card on them, or choosing them in the menu, opens the close dialog, which asks for the reason (needed for lost, optional for won). Closing is an ordinary mutation: the card moves when the API has answered.
- **A move between open stages is optimistic**, the one optimistic mutation in the app (`moveOpportunity` in [`opportunities.slice.ts`](../../frontend/src/features/opportunities/opportunities.slice.ts)). The thunk remembers where the card was, moves it at once with the `cardMoved` reducer (which also moves its share of both columns' counts and totals), and calls the API. On success the API's opportunity replaces the card and the board is **not** reloaded; on failure the card goes back to its old column and place, and the caller shows a toast that says so (`useOpportunityStage`). Every other change (create, edit, close, reopen, reassign, delete) updates the card from the API's answer and then reloads the board, because counts and totals are the API's.
- **Read-only users** get the board without the menus, without `draggable`, and without drop targets.

### Pipeline stages

The stages are their own feature, [`src/features/pipeline-stages/`](../../frontend/src/features/pipeline-stages/), mirroring the API module. Its slice holds the whole pipeline in order (the open stages, then Won, then Lost); every stage request answers with the whole pipeline, which replaces `data`, so the client never works out positions itself. `usePipelineStages()` loads it for any component that needs the stages (a stage filter, the stepper of an opportunity, the stage select of a form), and `openStages(stages)` gives the ones an opportunity can be moved to.

`/settings/pipeline` ([`pipeline-settings-page.tsx`](../../frontend/src/features/pipeline-stages/pipeline-settings-page.tsx)) is for Admins, guarded like Users. Stages are reordered with "Move up" and "Move down" buttons, which work with a keyboard and a finger. The button that was used gets the focus back once the new order is on screen (and is not disabled while the order is being saved, which would drop the focus), so a stage can be moved several places with Enter alone; deleting a stage that holds opportunities first asks which open stage takes them. Won and Lost are fixed rows that can only be renamed. The API refuses an action that does not apply (a 21st open stage, deleting the last one) as `VALIDATION_FAILED` with `details: null`; the dialog then says why in its own words instead of the generic sentence.

### Converting a lead

"Convert" on an open lead (the record page and the row menu) opens [`ConvertLeadDialog`](../../frontend/src/features/leads/convert-lead-dialog.tsx): a contact (new from the lead, or an existing one), a company (new with the lead's company name, an existing one, or none) and, unless unticked, an opportunity. It follows [Forms and mutations](#forms-and-mutations) with two things of its own:

- The API names a field by its place in the request (`company.name`, `opportunity.stageId`). The form's fields are flat (`companyName`, `stageId`), so `FIELD_OF_PATH` maps one to the other before `applyServerError` runs. Do the same for any other request with nested objects.
- Which fields are needed depends on the choices made, so that is checked in `onSubmit` (`missingFields`), not in the Zod schema: a field of a choice that is not selected must never block the form.

After it the user lands on the new opportunity, or else on the contact. A lost lead has no Convert: it is reopened first. The lead stays as a read-only record (see [The record page](#the-record-page)); the list marks it with its "Converted" badge and the contact it became.

### Tasks

Tasks are the feature [`src/features/tasks/`](../../frontend/src/features/tasks/), mirroring the API module. A task is not an owned record: who sees it follows who it is assigned to and who made it, and whoever sees it may change it. `taskAccess(role)` in [`task-labels.ts`](../../frontend/src/features/tasks/task-labels.ts) says what the UI offers: a Read-only user sees tasks and changes nothing; an Admin and a Sales Manager get the Assignee filter.

- **The time zone goes with every request.** "Overdue" and "due today" are calendar days of the viewer, so the API functions in `tasks.api.ts` and `dashboard.api.ts` add `tz` themselves, from `browserTimeZone()` in [`src/lib/time-zone.ts`](../../frontend/src/lib/time-zone.ts). A caller never passes it and so cannot forget it.
- **`/tasks` ([`tasks-page.tsx`](../../frontend/src/features/tasks/tasks-page.tsx))** shows the open tasks in four groups, Overdue, Due today, Upcoming and No due date, each with its count. The groups are the API's (`due=`): `fetchOpenTasks` asks for the four side by side, so the client never decides what is overdue. A group holds its first 50 tasks and says so when there are more. The search text, the Assignee filter ("Me" by default, a team member, or "Everyone") and the Due filter live in the address like any list; `?view=done` shows the completed tasks, paged; `?open=<id>` opens one task's dialog, which is what a notification links to. A Read-only user is never given a task, so they get everyone's tasks without a filter.
- **`TaskRow`** is one task wherever it is listed: a 24px checkbox in a 44px hit area, the title (a button that opens the task), the linked record as a link with a badge that says what kind it is, the due date, the reminder, and the assignee when it is not the viewer. An overdue date is in the destructive colour **and** starts with the word "Overdue".
- **Ticking a task off is optimistic**, the second optimistic mutation in the app. `completeTask` puts the id into `tasks.completed` when the request starts and takes it out again when the API refuses. Every list of open tasks (the page, Home, a record's card) leaves those ids out with `stillOpen(tasks, completed)`, so the task disappears at once everywhere and comes back exactly where it was on failure; no list has to be rearranged by hand. The checkbox goes through `useTaskToggle(onChanged)`, which shows the toast ("Task completed." with **Undo**, or the sentence that says the task is back in the list) and calls `onChanged` for a list that keeps its tasks outside the slice. Reopening is an ordinary mutation.
- **`TaskDialog`** adds a task or opens one: title, description, due date and time, assignee (the people the user may assign to), the linked record (a type select, then that type's picker) and the reminder. It is full-screen on phones. The reminder is a choice (None, At due time, 1 hour before, 1 day before, Custom date and time) that becomes the one moment the API stores, `reminderAt` (`reminderMoment`), and is read back from it when a task is edited (`reminderOf`). A choice that counts back from the due date needs one, which is checked in the form. An edit sends only what changed; clearing a field sends `null`. The API names the linked record `record.id`, which `forFormFields` puts on the form's `recordId`. A Read-only user gets the task's details instead of the form.
- **`RecordTasks`** is the Tasks card of a record page: its open tasks, soonest first, five at a time with "Show all", and "Add task" with the record filled in. Like `RecordOpportunities`, its answer does not enter the store.

### Follow-ups

A lead and an opportunity have one follow-up reminder: a moment (`followUpAt`) and a note. [`FollowUp`](../../frontend/src/components/shared/follow-up.tsx) is the shared control, mounted under the record's header so that it is in view at every width. With nothing set it is the "Set follow-up" button; with one set it is a strip with the moment, the note, **Change** and **Clear**. A follow-up that has passed says "Follow-up overdue" in words. The feature hands over its own request, like the shared record dialogs:

```tsx
<FollowUp
  at={lead.followUpAt}
  note={lead.followUpNote}
  canSet={access.canWrite && isOpenLeadStatus(lead.status)}
  canClear={access.canWrite}
  onSave={(input) => dispatch(setLeadFollowUp({ id: lead.id, input })).unwrap()}
/>
```

`canSet` is false where the API refuses a new follow-up (a converted or lost lead, a closed opportunity); one that is still set there can be cleared. The request replaces the follow-up: the note is sent every time, and `at: null` clears both.

### Notifications

[`src/features/notifications/`](../../frontend/src/features/notifications/) is the bell and the page behind it. The slice holds `unread` (the number on the bell) and `list` (the notifications, newest first, with `more` for "Load more").

- **The bell ([`notification-bell.tsx`](../../frontend/src/features/notifications/notification-bell.tsx))** is in the top bar at every width. It asks for the unread count when it appears, every 60 seconds after that and when the window gets the focus back; **while the tab is hidden it asks nothing**, and it catches up the moment the tab is looked at again. The number is part of the bell's name ("Notifications, 3 unread"). When the count has gone up and the list is loaded, the list is loaded again too.
- **From `md` the bell opens a panel** with the latest six, built on the dropdown menu so that it works with the arrow keys; **on a phone it is a link to `/notifications`**, where a panel would cover the screen anyway. The page lists everything with "Load more" and "Mark all as read".
- **Unread is never colour alone**: an unread notification has a bolder title and a "New" badge.
- **Opening one** marks it as read and goes to its `link`. The link comes from the API, and is still passed through `safeNextPath`: only a path inside this app is ever followed.

### The dashboard

Home is [`src/features/dashboard/`](../../frontend/src/features/dashboard/), mirroring the API module. The slice holds `me` (everyone) and `team` (with the range it was asked for).

- **Everyone gets their own dashboard** (`my-dashboard.tsx`, from `GET /dashboard/me`): five tiles (open leads, pipeline value, tasks due today, overdue tasks, won this month), the tasks that are due with their checkboxes, the follow-ups that are due, the pipeline by stage and the open leads by status. **Every number is a link to the list it counts**, with the filter set (`/tasks?due=overdue`, `/leads?status=NEW`, `/opportunities?view=list&stageId=`). The figures are the user's own, so for a role that also sees other people's records the links add `ownerId=<me>`.
- **Bars are drawn without a chart library**: one inline SVG `rect` whose width is the share of the largest value (`Bar`). The count and the amount are always written beside the bar, so the bar is hidden from screen readers. Do not add a chart dependency for a bar.
- **The Team section** (`team-section.tsx`, from `GET /dashboard/team`) is rendered for an Admin and a Sales Manager only, so nobody else ever asks the API for it (`seesTeamDashboard`). It has a date range (This month, Last month, Last 7 days, Last 30 days, or two dates), sent as days in the viewer's time zone, and one row for each person with a totals row. It is a table from `lg` and cards below, because eight figures do not fit a tablet. Sorting is done in the browser, by a column heading (`aria-sort`) or, for the cards, a "Sort by" select. "Open pipeline" and "Overdue tasks" are as of now whatever the range, and the section says so.
- **The two parts load on their own**: each has its skeleton, and its own error with Retry, and a failure of one leaves the other on screen. A brand-new install shows zeros and a sentence in each empty list.

### Custom fields

An Admin's own fields on leads, contacts, companies and opportunities are the feature [`src/features/custom-fields/`](../../frontend/src/features/custom-fields/), mirroring the API module (see [backend](backend.md#custom-fields)). The slice holds `fields` (the fields in use of each record type, which every user may read) and `settings` (every field of the record type open on the settings page, archived ones last). A change on the settings page is written into both, so forms and filters follow without asking again. `useCustomFields("LEAD")` loads the fields for a component that needs them; a form page uses `useCustomFieldsForForm`, which also says when the form may be drawn (a form takes its starting values once).

Everything that shows a custom field is drawn **from the definitions by one shared component each**, in `src/components/shared/`, so a field an Admin adds appears everywhere with no code:

- **Forms: [`custom-fields-form.tsx`](../../frontend/src/components/shared/custom-fields-form.tsx).** A record form keeps the custom fields under one key, `customFields`, as text keyed by the field's id. The form adds four things:

  ```tsx
  const schema = useMemo(
    () => leadFormSchema.extend({ customFields: customFieldsSchema(customFields, lead?.customFields) }),
    [customFields, lead],
  );
  // defaultValues: { ..., customFields: customFieldDefaults(customFields, lead?.customFields) }
  <CustomFieldsSection control={control} fields={customFields} stored={lead?.customFields} />
  // applyServerError(error, form.setError, [...LEAD_FORM_FIELDS, ...customFieldPaths(customFields)])
  ```

  `CustomFieldsSection` draws a text box, a number box (text with a decimal keypad, sent as a JSON number), a native date input or a select, marks required fields, and draws nothing when there are no fields. `customFieldsForCreate` sends only the fields that were filled in; `changedCustomFields` sends only the ones that changed, `null` for one that was emptied, because the API merges key by key. A required field must be filled in on a new record; on an existing one it only cannot be emptied, which is the API's rule. The API's errors arrive at `customFields.<field id>` and land on the field.
- **A stored dropdown value whose option was removed** is listed last in its select as "West (removed option)". It can be kept (an unchanged field is never sent) and gone back to while the form is open; it is not offered to a record that never held it.
- **Record pages: [`custom-fields-card.tsx`](../../frontend/src/components/shared/custom-fields-card.tsx)** shows every field in use with the record's value (`formatNumber`, `formatDay`) or `EmptyValue`.
- **List filters (CF-03): [`custom-fields-filter.tsx`](../../frontend/src/components/shared/custom-fields-filter.tsx).** `CustomFieldFilterButton` goes in `ListToolbar`'s `more` and opens a panel with one control per field: text contains, a dropdown's option, a number range, a date range. It is a dialog, and full-screen on a phone. `CustomFieldFilterChips` goes under the toolbar: one removable chip per field and "Clear all". Both work on `state.custom`, which is exactly what the API takes, so the page spreads it into the list's query (and the export's, and the board's). The address is sent as it is, because which fields exist is the API's to say; when the API refuses a filter (a hand-edited address, a field archived since) the chips name it and offer to remove it, and the rest of the page keeps working. The query types of the four lists are the generated ones `& CustomFilterParams`, since OpenAPI cannot list parameters whose names depend on data.

`/settings/custom-fields` ([`custom-fields-settings-page.tsx`](../../frontend/src/features/custom-fields/custom-fields-settings-page.tsx)) is for Admins, guarded and built like Pipeline: a tab per record type (kept in the address, `?type=contacts`), the fields in order with "Move up" and "Move down" buttons that keep the focus, Edit and Archive, and an Archived section with Restore and Delete. A field's type is fixed once it exists, so the edit dialog shows it without a control. A dropdown's options are edited as a list (add, remove, move up and down). Deleting is permanent and removes the values from every record, so its dialog needs a ticked box before the button works. The limit of 30 fields in use is said on the page ("30 of 30") and, when the API refuses the 31st as `VALIDATION_FAILED` with `details: null`, in the dialog's own words.

### Export and import

**Export.** Every list has "Export CSV" in [`ListActions`](../../frontend/src/components/shared/list-actions.tsx), for every role including Read-only: leads, contacts, companies, the opportunities list (not the board) and tasks. The feature's API file has the call (`exportLeads(query)`), which hands the list's own query to `downloadExport` in [`src/lib/api/download.ts`](../../frontend/src/lib/api/download.ts): it drops the page, adds the viewer's `tz`, fetches the file as a Blob through the one axios instance and reads `Content-Disposition` and `X-Export-Truncated`. So the file holds exactly what the search, filters and sort show. `ListActions` shows progress, saves the file with `saveFile` ([`src/lib/save-file.ts`](../../frontend/src/lib/save-file.ts)) and warns in a toast when the list was cut off at 10,000 rows. The error body of a refused download arrives as a Blob too; the interceptor in `http.ts` reads it back, so a download rejects with an `ApiError` like any request.

**Import** is the feature [`src/features/imports/`](../../frontend/src/features/imports/), at `/import?type=leads|contacts|companies`. The lists of leads, contacts and companies link to it with their type (`importHref`), for every role but Read-only, who also gets a "no access" page there. It has no slice: nothing of an import is shown anywhere else, so the page calls `imports.api.ts` itself and keeps the three steps in its own state; leaving the page starts over.

1. **The file** ([`import-file-step.tsx`](../../frontend/src/features/imports/import-file-step.tsx)): the type, a drop area with a "Choose a file" button, what the file must look like, and a template made in the browser from `GET /imports/fields`. The browser checks the name (`.csv`) and the size (5 MB), reads the file with `File.text()` and sends its **text**; there is no upload library.
2. **The mapping** ([`import-mapping-step.tsx`](../../frontend/src/features/imports/import-mapping-step.tsx)): each column with sample values and a select of fields, pre-filled from the API's suggestion, with "Don't import". A field already taken by another column is switched off in the other selects, and the required fields without a column are listed; the Import button waits for them. The options are the owner (Admin and Sales Manager), "skip duplicates" and, for contacts, "create companies that do not exist yet". A table from `md`, stacked cards below. The form holds the columns by position, because a column's name may contain a dot.
3. **The results** ([`import-results-step.tsx`](../../frontend/src/features/imports/import-results-step.tsx)): created, skipped, failed (and companies created), each failed row with its spreadsheet row number, the reasons and its values, "Download failed rows" (the API's `failedCsv`, saved as it came), "Import another file" and a link to the list.

An error goes to the step it is about: `VALIDATION_FAILED` on `csv` and `PAYLOAD_TOO_LARGE` send the user back to step 1 with the reason (`fileProblem`), `mapping.<column>` lands on that column, `mapping` (a required field without a column) and anything else above the mapping, `ownerId` on the owner.

## Styling (D-08)

Styling is **Tailwind CSS 4 with shadcn/ui** (`radix` base, `nova` preset, configured in [`frontend/components.json`](../../frontend/components.json)). Use Tailwind classes; do not add inline styles or another styling system.

Generated shadcn code lives in `src/components/ui/` and is excluded from the strict lint rules; do not hand-edit it unless you also accept that the next regeneration will overwrite your change (pass a `className` instead). When adding a component with the shadcn tool, use the locally installed one (`pnpm exec shadcn add <name>`) and review any change it makes to `package.json` or the lockfile before committing; dependencies are pinned and reviewed by the owner.

### Theme tokens (D-15)

Colours are the shadcn CSS variables in [`src/app/globals.css`](../../frontend/src/app/globals.css), defined twice: `:root` for light and `.dark` for dark. **Use the token classes** (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border`, `bg-primary`, `text-destructive`), never a hex value or a raw palette colour, so both themes keep working without a `dark:` class.

- **Neutrals are zinc; there is one accent, blue.** `primary` (`#2563eb` in light, one step lighter in dark) is for the main action on a screen and the active navigation item (`bg-primary/10 text-primary`). Do not introduce a second accent.
- Corners are 8px (`--radius`; `rounded-lg`), borders are 1px, and surfaces are flat: no decorative shadows or gradients.
- The one exception to "tokens only" is status colour (green, amber) in `StatusBadge` and similar hints, which set a light and a `dark:` value together and always carry a word, never colour alone.
- The theme follows the device until the user picks Light or Dark in the user menu ([`theme-provider.tsx`](../../frontend/src/components/theme-provider.tsx), `next-themes`, the `dark` class on `<html>`). Check a new screen in both.

### Responsive rules

Every screen must work at 375px, 768px and 1280px **with no horizontal page scroll**. Start from the narrow layout and widen with `sm:` and larger prefixes.

- Put `min-w-0` on a flex or grid child that holds text, and `truncate` (one line) or `wrap-anywhere` (may wrap) on names, emails and links. Never set a fixed pixel width on content.
- Use `dvh`, not `vh` or `h-screen` (`min-h-dvh`, `max-h-[90dvh]`).
- Something that is wider than a screen by nature (the pipeline board, a row of stage buttons) scrolls sideways **inside its own container** (`overflow-x-auto` on a `min-w-0` box); the page never does. Below `md`, prefer showing one part at a time over a sideways scroll.
- A row of choices whose number an Admin decides (pipeline stages) wraps onto more lines (`flex-wrap`) or scrolls inside itself; it is never laid out for a fixed count.
- A form that fills a phone screen is a dialog made full-screen with a class on `DialogContent`, with its fields in a scrolling middle and its Save button in a bar at the bottom (see `log-conversation-button.tsx` and `task-dialog.tsx`). The class is `FULL_SCREEN_DIALOG` and the hook that keeps the bar above the on-screen keyboard is `useVisibleHeight`, both in [`src/lib/use-visible-height.ts`](../../frontend/src/lib/use-visible-height.ts). It is not a `sheet` or a drawer.
- A dialog with a search box (the company picker) sits near the top on phones (`max-sm:top-4 max-sm:translate-y-0`), so its results are not hidden by the on-screen keyboard, and gives its results a fixed height so it does not jump while they change.
- A dialog is capped and scrolls inside: `className="max-h-[90dvh] overflow-y-auto"` on `DialogContent`. A title that can be long (it holds a record's name) gets `pr-8 wrap-anywhere`, so it wraps and clears the close button.
- A grid of form fields starts with `grid-cols-1`. Without it the single column is as wide as its widest content, and a long value in a textarea pushes the fields out of their card.
- Anything a finger taps in the navigation is at least 44px tall; form controls and their buttons are 40px (`h-10`).
- To check: open the page at each width, in light and dark, and confirm `document.documentElement.scrollWidth <= document.documentElement.clientWidth`. Then check the elements, not only the page: nothing visible should have a right edge past the viewport or past its parent's box. Use records with long names, companies and emails, and look at the page as well: a card clips content that is too wide instead of making the page scroll, so the number alone can hide a broken layout.

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
| Only `UNAUTHENTICATED` signs the user out | `src/lib/api/http.test.ts` |
| `?next=` cannot leave the app | `src/lib/safe-next.test.ts`, `login-form.test.tsx` |
| Logout and session expiry reset every slice | `auth.slice.test.ts` |
| List states and the table/cards pair | `responsive-list.test.tsx` |
| List state in the address, the search debounce, paging arithmetic | `list-url-state.test.tsx`, `list-toolbar.test.tsx`, `list-pagination.test.tsx` |
| A stale list answer never replaces a newer one | `leads.slice.test.ts` |
| Each role sees only the lead controls it may use | `leads-page.test.tsx`, `lead-detail-page.test.tsx`, `lead-form.test.tsx` |
| The same for contacts and companies; the shared menus, dialogs, loader and list scaffolding | `contacts-page.test.tsx`, `contact-detail-page.test.tsx`, `contact-form.test.tsx`, `companies-page.test.tsx`, `company-detail-page.test.tsx`, `company-form.test.tsx` (and the leads tests, which run through the same shared components) |
| The company picker: search, pick, clear, states, the filter's name lookup | `company-picker.test.tsx`, `contact-form.test.tsx`, `contacts-page.test.tsx` |
| A company's page lists its contacts and warns before a delete that they lose the link | `company-detail-page.test.tsx`, `companies-page.test.tsx` |
| A website is a link only when it is a web address | `companies-page.test.tsx`, `company-form.test.tsx` |
| Every record type reads and writes its timeline under its own path; "Last contact" follows only its own record | `record-types.test.ts`, `timeline.record-types.test.tsx`, `contacts.last-contact.test.ts` |
| The activity feed links each entry to the right record page and names its type | `activity-page.test.tsx` |
| The record page shows one column at a time below `lg`, an `extra` section included | `shared-components.test.tsx` (`RecordLayout`), `lead-detail-page.test.tsx`, `company-detail-page.test.tsx` |
| Timeline entry titles, filters, "Load more", states, and no form for a Read-only user | `timeline.test.tsx`, `lead-detail-page.test.tsx` |
| The timeline form: both modes, validation, server errors on fields, text kept on failure | `timeline-composer.test.tsx`, `log-conversation-button.test.tsx` |
| A saved entry shows at once; the timeline reloads when the record changes | `timeline.slice.test.ts`, `timeline.test.tsx`, `lead-detail-page.test.tsx` |
| Only Admin and Sales Manager reach Activity; its filters live in the address. Contacts, Companies and Opportunities are in the navigation for every role; Pipeline is for Admins | `activity-page.test.tsx`, `nav-items.test.ts` |
| The board: columns, counts and totals; a move shows at once and is undone when refused; Won and Lost open the close dialog; the phone's stage buttons; the capped note; no menus or dragging for a Read-only user | `opportunity-board.test.tsx`, `opportunities.slice.test.ts` |
| The Board / List switch lives in the address and survives every filter change; each role sees only the opportunity controls it may use | `opportunities-page.test.tsx`, `opportunity-detail-page.test.tsx`, `opportunity-form.test.tsx` |
| Closing needs a reason for lost and none for won; a closed opportunity shows outcome, reason and date | `opportunity-board.test.tsx`, `opportunity-detail-page.test.tsx` |
| The contact picker, and that it is the same picker as the company's | `contact-picker.test.tsx`, `company-picker.test.tsx`, `opportunity-form.test.tsx` |
| Converting a lead: defaults from the lead, every combination of choices, nested field errors on the right fields, where the user lands; a converted lead is read-only but can be reassigned and written to | `convert-lead-dialog.test.tsx`, `lead-detail-page.test.tsx`, `leads-page.test.tsx` |
| Pipeline settings: Admin only, reorder with buttons, delete with a stage to move to, Won and Lost fixed | `pipeline-settings-page.test.tsx`, `pipeline-stages.slice.test.ts` |
| A company's and a contact's page list their opportunities | `company-detail-page.test.tsx`, `contact-detail-page.test.tsx` |
| Tasks: the four groups and their counts, a tick that shows at once and is undone when refused, the dialog and its reminder choices, `?open=`, the Done view, each role's controls | `tasks-page.test.tsx`, `tasks.slice.test.ts`, `task-labels.test.ts` |
| A record page lists its tasks and adds one with the record filled in | `record-tasks.test.tsx`, `lead-follow-up.test.tsx`, `opportunity-follow-up.test.tsx` |
| The follow-up control: set, change, clear, overdue in words, nothing offered where the API refuses | `follow-up.test.tsx`, `lead-follow-up.test.tsx`, `opportunity-follow-up.test.tsx` |
| The bell asks every minute and on focus and not while the tab is hidden; opening marks as read and never leaves the app; mark all; load more | `notification-bell.test.tsx`, `notifications-page.test.tsx`, `notifications.slice.test.ts` |
| Home: every number links to its list; the Team section is shown to, and asked for by, an Admin and a Sales Manager only; sorting in the browser; each part has its own error | `dashboard-page.test.tsx`, `dashboard.slice.test.ts` |
| Tasks is in the navigation for every role and a phone tab; the bar keeps to three tabs plus More | `nav-items.test.ts` |
| `?from=` cannot leave the app | `lead-form.test.tsx` (through `safeNextPath`) |
| Custom fields settings: Admin only, the tabs, add and edit with the type fixed, the options editor, reorder with buttons, archive and restore, permanent delete behind a ticked box, the limit of 30 | `custom-fields-settings-page.test.tsx`, `custom-fields.slice.test.ts` |
| Custom fields in a form, per type: required, a number sent as a number, only changed keys on an edit, a removed option kept, the API's errors on their fields | `custom-fields-form.test.tsx`, `leads-custom-fields.test.tsx` |
| The Custom fields card: every type, the empty marker, hidden without fields | `custom-fields-card.test.tsx`, `leads-custom-fields.test.tsx` |
| Custom field filters: the panel per type, the address, chips, Clear all, a refused filter named and removable | `custom-fields-filter.test.tsx`, `list-url-state.test.tsx`, `leads-custom-fields.test.tsx` |
| An export is sent the list's own query without the page, with `tz`; the truncation warning; a refused download is an `ApiError` | `download.test.ts`, `list-actions.test.tsx`, `list-actions.pages.test.tsx`, `leads-custom-fields.test.tsx` |
| Export for every role, Import for every role but Read-only; no export on the board; the board and the list keep the custom filters | `list-actions.pages.test.tsx`, `leads-custom-fields.test.tsx` |
| The import: file checks, the template, the preview, the mapping rules, the options by role and type, results, the failed rows file byte for byte, each error on its step | `import-page.test.tsx`, `import-labels.test.ts` |
| Thin route files, slice shape, error switch, tokens, responsive rules | Code review, with the health, auth, users, leads, contacts, companies, opportunities and tasks features as the reference |

`pnpm --dir frontend check` runs ESLint (zero warnings allowed), the Prettier check and the strict TypeScript check.
