# 0003: Async thunks with one axios instance instead of RTK Query

## Status

Accepted. This is an owner decision (D-06), made on 2026-10-08 when planning Phase 1.

## Context

The frontend needs one consistent way to load data from the API through Redux Toolkit. RTK Query is the library's own answer and was the recommended option. The owner declined it and chose `createAsyncThunk` with a single shared axios instance, so that each feature's loading, success and error states are explicit and visible in the code.

## Decision

- API calls go through `createAsyncThunk` and **one** axios instance, `http` in `frontend/src/lib/api/http.ts`. Its response interceptor turns every failure into an `ApiError` carrying a stable `code`.
- Each feature slice holds `{ data, status, error }` and handles pending, fulfilled and rejected explicitly.
- Components use only the typed `useAppDispatch` and `useAppSelector` hooks.
- **RTK Query is not used and must not be reintroduced** without a new decision record that supersedes this one.

The pattern is written down once, with copyable code, in the [frontend standard](../standards/frontend.md), and the health feature is the reference implementation.

## Consequences

- More hand-written code per feature than RTK Query would need: a state shape, a thunk, three reducers and a loading guard. The cost is paid by requiring every feature to copy the same recipe, so they all look alike and a contributor can read any of them.
- There is no built-in caching or request de-duplication. The thunk's `condition` skips a request while one is in flight; anything more (caching, refetch rules) is written by hand when a feature needs it.
- The pattern is enforced by ESLint (`no-restricted-imports` bans untyped Redux hooks, axios outside `http.ts`, and `@reduxjs/toolkit/query*`), so drift fails `pnpm --dir frontend check`.
- It is costly to reverse: every feature's data layer in Phases 2 to 8 is written to this pattern, so a later switch means rewriting each of them.
