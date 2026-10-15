# OpenCRM web app

The web client of OpenCRM: every screen a sales person, a manager and an Admin use in the browser, at phone, tablet and desktop widths. It holds no business rules of its own. It calls the [API](../backend/README.md), shows what the API answers, and offers only what the API would allow.

How the code is written is in the [frontend standard](../docs/standards/frontend.md); read it before you change anything here. This page is the short version for getting started.

## Stack

Versions are exact and come from [`package.json`](package.json); every change to them needs the owner's approval ([dependency rules](../docs/standards/security.md#dependency-rules)).

| Part            | Package and version                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Runtime         | Node.js 24 (pinned in [`.nvmrc`](../.nvmrc)), pnpm 11.28.5, TypeScript 6.0.3                                           |
| Framework       | Next.js 16.4.0 (App Router), React 19.3.0                                                                              |
| State and data  | Redux Toolkit 2.13.0 with react-redux 9.3.0 (`createAsyncThunk`, no RTK Query), axios 1.20.0                           |
| Forms           | react-hook-form 7.87.0, `@hookform/resolvers` 5.9.1, Zod 4.6.5                                                         |
| UI              | Tailwind CSS 4.3.3, shadcn 4.21.4 on radix-ui 1.7.0, lucide-react 1.52.0 icons, sonner 2.0.8 toasts, next-themes 0.4.6 |
| API types       | openapi-typescript 7.13.0, generated from the API's OpenAPI document                                                   |
| Tests           | Vitest 5.0.3, Testing Library (React 16.3.3, user-event 14.6.7, jest-dom 7.0.1), jsdom 30.1.2                          |
| Lint and format | ESLint 10.12.0 with `eslint-config-next` 16.4.0 and typescript-eslint 8.71.1, Prettier 3.9.9                           |

## Run it

The easiest way is the whole stack in Docker, from the repository root ([Quick start](../README.md#quick-start)):

```sh
docker compose up
```

The `web` container installs the dependencies and runs `next dev` on port 3000 (in webpack mode, which sees edits made through the Docker bind mount). Open <http://localhost:3000>; a saved file updates the page. A new installation first asks for the Admin account.

On your own machine (Node.js 24 and pnpm 11, see [CONTRIBUTING.md](../CONTRIBUTING.md#setting-up-to-commit)), run the scripts from the repository root with `pnpm --dir frontend <script>`, or from this folder with `pnpm <script>`:

| Script                                        | What it does                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `check`                                       | `lint`, `format:check` and `typecheck` in one go. Warnings count as failures.                                                               |
| `test`                                        | Vitest in jsdom. No network and no API needed.                                                                                              |
| `build`                                       | `next build`. Needs `NEXT_PUBLIC_API_URL` and network access (the page font is fetched at build time).                                      |
| `start`                                       | `next start`, serving a build. Needs `NEXT_PUBLIC_API_URL` too, because `next.config.ts` checks the environment.                            |
| `dev`                                         | `next dev`.                                                                                                                                 |
| `api:types`                                   | Regenerates [`src/lib/api/schema.d.ts`](src/lib/api/schema.d.ts) from [`../backend/openapi/openapi.json`](../backend/openapi/openapi.json). |
| `audit`                                       | `pnpm audit --audit-level=high`. Run it as `pnpm --dir frontend run audit`.                                                                 |
| `format`, `lint`, `format:check`, `typecheck` | The parts of `check` on their own; `format` rewrites files.                                                                                 |

For example:

```sh
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1 pnpm --dir frontend build
```

Running `next dev` on your machine instead of in Docker needs a `.env` file in this folder (copy [`.env.example`](.env.example)): Next.js reads `.env`, not `.env.example`. The API must also allow the web app's origin in its `CORS_ORIGINS`.

**If `check` reports type errors inside `.next/types/`**, they come from an old build or dev server in `frontend/.next`, which the type-check includes. Delete the `.next` folder (or run `build` again) and run `check` again.

## Environment

[`src/env.ts`](src/env.ts) is the only file that reads `process.env`. It is imported by `next.config.ts`, so `next dev` and `next build` stop at once and name a variable that is missing or wrong. There is one variable:

| Variable              | Example                        | Notes                                                                                                                                                                                                      |
| --------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | The address the **browser** uses to reach the API. It is written into the browser bundle at build time, so it must be set when you build (and when you run `next start`), and it must never hold a secret. |

In Docker Compose it is set from `API_PORT` in [`compose.yaml`](../compose.yaml).

## Folder layout

```text
frontend/src/
├── app/                   Route files only: each renders one feature component
│   ├── (auth)/            Signed-out pages: login, setup, forgot-password, reset-password, accept-invite
│   ├── (app)/             Signed-in pages inside the app frame: leads, contacts, companies, opportunities,
│   │                      tasks, quotes, invoices, activity, notifications, import, profile, settings/...
│   ├── (print)/           Print views of a quote and an invoice, without the frame
│   └── status/            The public API and database status page
├── features/<name>/       Everything for one feature: components, slice, API calls, types, tests
├── components/
│   ├── shared/            The shared building blocks (lists, record pages, forms, pickers, dialogs)
│   ├── app-shell/         The frame: sidebar, bottom tab bar, top bar; nav-items.ts is the one nav list
│   └── ui/                Generated shadcn components (do not hand-edit)
├── lib/                   The HTTP client and generated API types (lib/api/), formatting, helpers
├── store/                 The Redux store (makeStore) and the typed hooks
└── test/                  Test helpers: renderWithStore, the router mock
```

A feature folder carries the name of the API module it uses (`features/leads/` and `backend/src/modules/leads/`), so both halves are found from one name. The features today: `activity`, `auth`, `companies`, `contacts`, `custom-fields`, `dashboard`, `email-settings`, `email-templates`, `emails`, `health`, `imports`, `invoices`, `leads`, `notifications`, `opportunities`, `organization`, `pipeline-stages`, `products`, `quotes`, `tasks`, `timeline` and `users`. The [health feature](src/features/health/) is the smallest complete example.

**Route files stay thin**: a file under `src/app/` renders a feature component and nothing else, with no fetching or store code.

## State and API calls

There is one pattern for loading data, and every feature follows it ([the slice recipe](../docs/standards/frontend.md#the-slice-recipe)):

1. `<feature>.types.ts`: types taken from the generated API schema, never written by hand.
2. `<feature>.api.ts`: plain functions that call the shared `http` instance and return the unwrapped `data`.
3. `<feature>.slice.ts`: the state, the `createAsyncThunk` thunks and the reducers.
4. Components use only the typed hooks `useAppDispatch` and `useAppSelector` from `src/store/hooks.ts`.

Then the reducer is added to `makeStore` in [`src/store/index.ts`](src/store/index.ts). Signing out, or a session that ends, resets every slice.

- **One axios instance**, `http` in [`src/lib/api/http.ts`](src/lib/api/http.ts). It sends the session cookie, turns every failure into an `ApiError` with the API's `code`, and signs the user out only on the code `UNAUTHENTICATED` (never on HTTP 401 alone).
- **Errors are shown by `code`**, never by parsing a message. The words for the codes many screens share are in [`src/lib/api/error-messages.ts`](src/lib/api/error-messages.ts).
- **RTK Query is not used**, by the owner's decision ([decision 0003](../docs/decisions/0003-async-thunks-with-axios.md)). Lint fails on an import of it, of axios outside `http.ts`, or of `process.env` outside `env.ts`.

## API types

The web app never imports backend code. Its types come from the API's committed contract:

```sh
pnpm --dir backend openapi:generate   # after changing a backend route or schema
pnpm --dir frontend api:types         # writes src/lib/api/schema.d.ts
```

Commit both generated files. Never edit `schema.d.ts` by hand. CI runs `api:types` again and fails if the committed file differs.

## Shared components and the frame

- **Build screens from [`src/components/shared/`](src/components/shared/)**, so every module looks and reads the same: `PageHeader`, `ResponsiveList` (a table from `md`, cards below), `ListToolbar` and `ListPagination` (search, filters, sort and paging, kept in the address), `RecordLayout` and its parts for a record page, the record menus and dialogs, `RecordPicker`, `FormField`, `FormAlert`, `PageState`, the custom field components, and more. The full table is in [Shared components](../docs/standards/frontend.md#shared-components).
- **One navigation list**, [`src/components/app-shell/nav-items.ts`](src/components/app-shell/nav-items.ts), drives the sidebar, the phone's bottom tab bar, its "More" menu and the Settings area. A new page adds one line there.
- **Styling** is Tailwind CSS with shadcn/ui and the theme tokens in [`src/app/globals.css`](src/app/globals.css): zinc neutrals, one blue accent, light and dark themes. Use the token classes, never a raw colour.

## Responsive rules

Every screen must work at 375px, 768px and 1280px wide, in light and dark, **with no horizontal page scroll**. Start from the phone layout and widen it.

| Width                   | Navigation                                              |
| ----------------------- | ------------------------------------------------------- |
| Phone, below 768px      | A bottom tab bar (Home, Leads, Tasks, More); no sidebar |
| Tablet, 768px to 1024px | The sidebar collapsed to icons                          |
| Desktop, 1024px and up  | The full sidebar                                        |

Forms that fill a phone screen are full-screen dialogs, and anything wider than a screen (the pipeline board) scrolls inside its own box. The rules, and how to check a page, are in [Responsive rules](../docs/standards/frontend.md#responsive-rules).

## Tests

```sh
pnpm --dir frontend test
```

Tests sit beside the code (`*.test.ts`, `*.test.tsx`). They mock a feature at its `*.api.ts` file and use a real store (`renderWithStore` in [`src/test/render-with-store.tsx`](src/test/render-with-store.tsx)); they never mock axios or the store. The router is replaced for every test by [`src/test/navigation-mock.ts`](src/test/navigation-mock.ts). What every feature must test is in the [testing standard](../docs/standards/testing.md#frontend-tests). On a slow or busy machine a few of the longer tests can pass Vitest's 5-second limit when the whole suite runs; run that file again on its own (`pnpm --dir frontend exec vitest run <file>`) to see whether it really fails. The run prints one harmless Vite warning ("ESM syntax in a file loaded as CommonJS"); the tests still run.

## Adding a feature

Copy the health feature and rename it; do not invent a new shape. The steps (generate the types, then types, API file, slice, components, tests, the reducer in `makeStore`, a thin route file and a line in `nav-items.ts`) are in [Adding a feature](../docs/standards/structure.md#adding-a-feature). A feature of owned records builds its list, record page and dialogs from the shared record components; see [What owned records share](../docs/standards/frontend.md#what-owned-records-share).

## Related

- [Frontend standard](../docs/standards/frontend.md), [testing standard](../docs/standards/testing.md)
- [Folder structure and naming](../docs/standards/structure.md)
- [The API](../backend/README.md) and its [contract](../backend/openapi/openapi.json)
- [CONTRIBUTING.md](../CONTRIBUTING.md)
