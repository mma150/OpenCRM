import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import type { components } from "@/lib/api/schema";
import { makeStore } from "@/store";

import * as timelineApi from "./timeline.api";
import {
  call,
  created,
  leadRecord,
  meeting,
  note,
  otherRecord,
  savedEntry,
  statusChanged,
  timelinePage,
} from "./timeline.fixtures";
import {
  addNote,
  fetchMoreTimeline,
  fetchTimeline,
  logConversation,
  refreshTimeline,
  type TimelineQuery,
} from "./timeline.slice";
import type { TimelineEntry, TimelinePage } from "./timeline.types";

vi.mock("./timeline.api");

const all: TimelineQuery = { record: leadRecord, filter: "ALL" };
const forbidden: ApiError = { code: "FORBIDDEN", message: "Server text", details: null };

// A promise the test resolves or rejects by hand, so a request can stay "in flight".
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: ApiError) => void = () => undefined;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function loadedStore(page: TimelinePage = timelinePage(), query: TimelineQuery = all) {
  vi.mocked(timelineApi.listTimeline).mockResolvedValue(page);
  const store = makeStore();
  await store.dispatch(fetchTimeline(query));
  vi.mocked(timelineApi.listTimeline).mockClear();
  return store;
}

const ids = (entries: TimelineEntry[] | undefined) => entries?.map((entry) => entry.id);

describe("timeline slice: loading", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data, no error and no query", () => {
    expect(makeStore().getState().timeline).toEqual({
      data: null,
      status: "idle",
      error: null,
      query: null,
      more: { status: "idle", error: null },
    });
  });

  it("goes loading with the query, then succeeded with the entries and the meta", async () => {
    const request = deferred<TimelinePage>();
    vi.mocked(timelineApi.listTimeline).mockReturnValue(request.promise);
    const store = makeStore();

    const pending = store.dispatch(fetchTimeline({ record: leadRecord, filter: "NOTE" }));
    expect(store.getState().timeline).toMatchObject({
      status: "loading",
      data: null,
      query: { record: leadRecord, filter: "NOTE" },
    });
    expect(timelineApi.listTimeline).toHaveBeenCalledWith(leadRecord, {
      kind: "NOTE",
      page: 1,
      pageSize: 25,
    });

    request.resolve(timelinePage([note]));
    await pending;
    expect(store.getState().timeline).toMatchObject({
      status: "succeeded",
      data: timelinePage([note]),
      error: null,
    });
  });

  it("asks for every kind under All, and for SYSTEM under Changes", async () => {
    vi.mocked(timelineApi.listTimeline).mockResolvedValue(timelinePage());
    const store = makeStore();

    await store.dispatch(fetchTimeline(all));
    expect(timelineApi.listTimeline).toHaveBeenLastCalledWith(leadRecord, {
      page: 1,
      pageSize: 25,
    });
    await store.dispatch(fetchTimeline({ record: leadRecord, filter: "SYSTEM" }));
    expect(timelineApi.listTimeline).toHaveBeenLastCalledWith(leadRecord, {
      kind: "SYSTEM",
      page: 1,
      pageSize: 25,
    });
  });

  it("goes failed and keeps the ApiError code and message", async () => {
    vi.mocked(timelineApi.listTimeline).mockRejectedValue(forbidden);
    const store = makeStore();

    await store.dispatch(fetchTimeline(all));

    expect(store.getState().timeline).toMatchObject({
      status: "failed",
      data: null,
      error: forbidden,
    });
  });

  it("does not start a second request while the same one is loading", async () => {
    const request = deferred<TimelinePage>();
    vi.mocked(timelineApi.listTimeline).mockReturnValue(request.promise);
    const store = makeStore();

    const first = store.dispatch(fetchTimeline(all));
    await store.dispatch(fetchTimeline({ record: { ...leadRecord }, filter: "ALL" }));
    expect(timelineApi.listTimeline).toHaveBeenCalledTimes(1);

    request.resolve(timelinePage());
    await first;
  });

  it("keeps the entries during a reload, but never shows another record's or tab's", async () => {
    const store = await loadedStore();
    const request = deferred<TimelinePage>();
    vi.mocked(timelineApi.listTimeline).mockReturnValue(request.promise);

    const reload = store.dispatch(fetchTimeline(all));
    expect(store.getState().timeline.data).toEqual(timelinePage());
    request.resolve(timelinePage([call]));
    await reload;

    void store.dispatch(fetchTimeline({ record: leadRecord, filter: "NOTE" }));
    expect(store.getState().timeline.data).toBeNull();
    void store.dispatch(fetchTimeline({ record: otherRecord, filter: "ALL" }));
    expect(store.getState().timeline.data).toBeNull();
  });

  it("ignores the answer to an older query", async () => {
    const slow = deferred<TimelinePage>();
    vi.mocked(timelineApi.listTimeline).mockReturnValueOnce(slow.promise);
    vi.mocked(timelineApi.listTimeline).mockResolvedValueOnce(timelinePage([note]));
    const store = makeStore();

    const first = store.dispatch(fetchTimeline(all));
    await store.dispatch(fetchTimeline({ record: leadRecord, filter: "NOTE" }));
    slow.resolve(timelinePage());
    await first;

    expect(store.getState().timeline.data).toEqual(timelinePage([note]));
    expect(store.getState().timeline.query?.filter).toBe("NOTE");
  });

  it("refreshes the open timeline with its filter, and only for its own record", async () => {
    const notes: TimelineQuery = { record: leadRecord, filter: "NOTE" };
    const store = await loadedStore(timelinePage([note]), notes);
    vi.mocked(timelineApi.listTimeline).mockResolvedValue(timelinePage([note]));

    store.dispatch(refreshTimeline(otherRecord));
    expect(timelineApi.listTimeline).not.toHaveBeenCalled();

    store.dispatch(refreshTimeline(leadRecord));
    expect(timelineApi.listTimeline).toHaveBeenCalledWith(leadRecord, {
      kind: "NOTE",
      page: 1,
      pageSize: 25,
    });
  });
});

describe("timeline slice: load more", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("adds the next page to the end and leaves out an entry that is already there", async () => {
    const store = await loadedStore(timelinePage([call, meeting], { pageSize: 2, total: 4 }));
    const request = deferred<TimelinePage>();
    vi.mocked(timelineApi.listTimeline).mockReturnValue(request.promise);

    const more = store.dispatch(fetchMoreTimeline(all));
    expect(store.getState().timeline).toMatchObject({
      status: "succeeded",
      more: { status: "loading" },
    });
    expect(timelineApi.listTimeline).toHaveBeenCalledWith(leadRecord, { page: 2, pageSize: 25 });

    // `meeting` moved onto page 2 because an entry was saved in between.
    request.resolve(timelinePage([meeting, note, created], { page: 2, pageSize: 2, total: 5 }));
    await more;

    const { data, more: moreState } = store.getState().timeline;
    expect(ids(data?.entries)).toEqual(ids([call, meeting, note, created]));
    expect(data).toMatchObject({ page: 2, total: 5 });
    expect(moreState).toEqual({ status: "idle", error: null });
  });

  it("keeps the list and reports the error when the next page fails", async () => {
    const store = await loadedStore(timelinePage([call], { total: 3 }));
    vi.mocked(timelineApi.listTimeline).mockRejectedValue(forbidden);

    await store.dispatch(fetchMoreTimeline(all));

    expect(store.getState().timeline).toMatchObject({
      status: "succeeded",
      data: timelinePage([call], { total: 3 }),
      more: { status: "failed", error: forbidden },
    });
  });

  it("asks for nothing when everything is loaded, or while a page is on its way", async () => {
    const full = await loadedStore(timelinePage([call]));
    await full.dispatch(fetchMoreTimeline(all));
    expect(timelineApi.listTimeline).not.toHaveBeenCalled();

    const store = await loadedStore(timelinePage([call], { total: 3 }));
    const request = deferred<TimelinePage>();
    vi.mocked(timelineApi.listTimeline).mockReturnValue(request.promise);
    const first = store.dispatch(fetchMoreTimeline(all));
    await store.dispatch(fetchMoreTimeline(all));
    expect(timelineApi.listTimeline).toHaveBeenCalledTimes(1);
    request.resolve(timelinePage([meeting], { page: 2, total: 3 }));
    await first;
  });
});

describe("timeline slice: adding an entry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("puts a logged conversation at the top and counts it", async () => {
    const store = await loadedStore(timelinePage([call, created]));
    const saved = savedEntry({ kind: "CONVERSATION", conversationType: "EMAIL", body: "Sent it." });
    vi.mocked(timelineApi.logConversation).mockResolvedValue(saved);
    const input = { type: "EMAIL", occurredAt: saved.occurredAt, summary: "Sent it." } as const;

    const result = await store.dispatch(logConversation({ record: leadRecord, input })).unwrap();

    expect(result).toEqual(saved);
    expect(timelineApi.logConversation).toHaveBeenCalledWith(leadRecord, input);
    const { data, status } = store.getState().timeline;
    expect(ids(data?.entries)).toEqual(ids([saved, call, created]));
    expect(data?.total).toBe(3);
    expect(status).toBe("succeeded");
  });

  it("puts a conversation logged for an earlier day where it belongs", async () => {
    const store = await loadedStore(timelinePage([call, statusChanged, created]));
    const saved = savedEntry({
      kind: "CONVERSATION",
      conversationType: "CALL",
      occurredAt: "2026-10-07T08:00:00.000Z",
    });
    vi.mocked(timelineApi.logConversation).mockResolvedValue(saved);

    await store.dispatch(
      logConversation({
        record: leadRecord,
        input: { type: "CALL", occurredAt: saved.occurredAt, summary: "Earlier call." },
      }),
    );

    expect(ids(store.getState().timeline.data?.entries)).toEqual(
      ids([call, saved, statusChanged, created]),
    );
  });

  it("adds a note, and leaves another record's timeline alone", async () => {
    const store = await loadedStore(timelinePage([created]));
    const saved = savedEntry({ kind: "NOTE", body: "Remember this." });
    vi.mocked(timelineApi.addNote).mockResolvedValue(saved);

    await store.dispatch(addNote({ record: otherRecord, input: { body: "Remember this." } }));
    expect(ids(store.getState().timeline.data?.entries)).toEqual(ids([created]));

    await store.dispatch(addNote({ record: leadRecord, input: { body: "Remember this." } }));
    expect(timelineApi.addNote).toHaveBeenLastCalledWith(leadRecord, { body: "Remember this." });
    expect(ids(store.getState().timeline.data?.entries)).toEqual(ids([saved, created]));
  });

  it("switches back to All when the tab on screen would hide what was saved", async () => {
    const store = await loadedStore(timelinePage([note]), { record: leadRecord, filter: "NOTE" });
    const saved = savedEntry({ kind: "CONVERSATION", conversationType: "CALL", body: "Hello." });
    vi.mocked(timelineApi.logConversation).mockResolvedValue(saved);
    vi.mocked(timelineApi.listTimeline).mockResolvedValue(timelinePage([saved, note]));

    await store.dispatch(
      logConversation({
        record: leadRecord,
        input: { type: "CALL", occurredAt: saved.occurredAt, summary: "Hello." },
      }),
    );

    await vi.waitFor(() => {
      expect(store.getState().timeline.status).toBe("succeeded");
    });
    expect(store.getState().timeline.query?.filter).toBe("ALL");
    expect(ids(store.getState().timeline.data?.entries)).toEqual(ids([saved, note]));
  });

  it("rejects with the ApiError and leaves the list and its status alone", async () => {
    const store = await loadedStore(timelinePage([created]));
    vi.mocked(timelineApi.addNote).mockRejectedValue(forbidden);

    await expect(
      store.dispatch(addNote({ record: leadRecord, input: { body: "No." } })).unwrap(),
    ).rejects.toEqual(forbidden);

    expect(store.getState().timeline).toMatchObject({
      status: "succeeded",
      error: null,
      data: timelinePage([created]),
    });
  });
});

// These checks are made by tsc (pnpm typecheck); at run time they do nothing.
describe("timeline types", () => {
  it("come from the OpenAPI document", () => {
    expectTypeOf<TimelineEntry>().toEqualTypeOf<components["schemas"]["TimelineEntry"]>();
    expectTypeOf(timelineApi.logConversation).returns.resolves.toEqualTypeOf<
      components["schemas"]["TimelineEntry"]
    >();
    expectTypeOf(timelineApi.logConversation)
      .parameter(1)
      .toEqualTypeOf<components["schemas"]["LogConversationBody"]>();
    expectTypeOf(timelineApi.addNote)
      .parameter(1)
      .toEqualTypeOf<components["schemas"]["AddNoteBody"]>();
  });
});
