import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import type { components } from "@/lib/api/schema";
import { makeStore } from "@/store";

import * as activityApi from "./activity.api";
import { activityList, authors, queryFor, todayCall } from "./activity.fixtures";
import { fetchActivity, fetchActivityAuthors } from "./activity.slice";
import type {
  ActivityAuthor,
  ActivityEntry,
  ActivityList,
  ActivityListQuery,
} from "./activity.types";

vi.mock("./activity.api");

const query = queryFor();
const forbidden: ApiError = { code: "FORBIDDEN", message: "Server text", details: null };

// A promise the test resolves or rejects by hand, so a request can stay "in flight".
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("activity slice: the feed", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data, no error and no query, for the feed and the authors", () => {
    expect(makeStore().getState().activity).toEqual({
      list: { data: null, status: "idle", error: null, query: null },
      authors: { data: null, status: "idle", error: null },
    });
  });

  it("goes loading with the query, then succeeded with the entries, the meta and the summary", async () => {
    const request = deferred<ActivityList>();
    vi.mocked(activityApi.listActivity).mockReturnValue(request.promise);
    const store = makeStore();
    const noteQuery: ActivityListQuery = { ...query, kind: "NOTE", page: 2 };

    const pending = store.dispatch(fetchActivity(noteQuery));
    expect(store.getState().activity.list).toEqual({
      data: null,
      status: "loading",
      error: null,
      query: noteQuery,
    });
    expect(activityApi.listActivity).toHaveBeenCalledWith(noteQuery);

    request.resolve(activityList());
    await pending;
    expect(store.getState().activity.list).toMatchObject({
      status: "succeeded",
      data: activityList(),
      error: null,
    });
  });

  it("goes failed and keeps the ApiError code and message, and the last good page", async () => {
    vi.mocked(activityApi.listActivity).mockResolvedValueOnce(activityList());
    vi.mocked(activityApi.listActivity).mockRejectedValueOnce(forbidden);
    const store = makeStore();

    await store.dispatch(fetchActivity(query));
    await store.dispatch(fetchActivity(query));

    expect(store.getState().activity.list).toMatchObject({
      status: "failed",
      error: forbidden,
      data: activityList(),
    });
  });

  it("does not start a second request while the same one is loading", async () => {
    const request = deferred<ActivityList>();
    vi.mocked(activityApi.listActivity).mockReturnValue(request.promise);
    const store = makeStore();

    const first = store.dispatch(fetchActivity(query));
    await store.dispatch(fetchActivity({ ...query }));
    expect(activityApi.listActivity).toHaveBeenCalledTimes(1);

    request.resolve(activityList());
    await first;
  });

  it("lets a different query through and ignores the answer to the older one", async () => {
    const slow = deferred<ActivityList>();
    vi.mocked(activityApi.listActivity).mockReturnValueOnce(slow.promise);
    vi.mocked(activityApi.listActivity).mockResolvedValueOnce(activityList([todayCall]));
    const store = makeStore();

    const first = store.dispatch(fetchActivity(query));
    await store.dispatch(fetchActivity({ ...query, kind: "CONVERSATION" }));
    slow.resolve(activityList());
    await first;

    expect(store.getState().activity.list.data).toEqual(activityList([todayCall]));
  });
});

describe("activity slice: the authors", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("goes loading, then succeeded with the people", async () => {
    const request = deferred<ActivityAuthor[]>();
    vi.mocked(activityApi.listActivityAuthors).mockReturnValue(request.promise);
    const store = makeStore();

    const pending = store.dispatch(fetchActivityAuthors());
    expect(store.getState().activity.authors.status).toBe("loading");
    await store.dispatch(fetchActivityAuthors());
    expect(activityApi.listActivityAuthors).toHaveBeenCalledTimes(1);

    request.resolve(authors);
    await pending;
    expect(store.getState().activity.authors).toEqual({
      data: authors,
      status: "succeeded",
      error: null,
    });
  });

  it("goes failed and keeps the ApiError", async () => {
    vi.mocked(activityApi.listActivityAuthors).mockRejectedValue(forbidden);
    const store = makeStore();

    await store.dispatch(fetchActivityAuthors());

    expect(store.getState().activity.authors).toEqual({
      data: null,
      status: "failed",
      error: forbidden,
    });
  });
});

// These checks are made by tsc (pnpm typecheck); at run time they do nothing.
describe("activity types", () => {
  it("come from the OpenAPI document", () => {
    expectTypeOf<ActivityEntry>().toEqualTypeOf<components["schemas"]["ActivityEntry"]>();
    expectTypeOf(activityApi.listActivityAuthors).returns.resolves.toEqualTypeOf<
      components["schemas"]["ActivityAuthor"][]
    >();
    expectTypeOf<ActivityList["summary"]>().toEqualTypeOf<
      components["schemas"]["ActivitySummary"]
    >();
  });
});
