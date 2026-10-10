import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  newStage,
  proposalStage,
  qualifiedStage,
  wonStage,
} from "@/features/pipeline-stages/pipeline-stages.fixtures";
import * as timelineApi from "@/features/timeline/timeline.api";
import { savedEntry } from "@/features/timeline/timeline.fixtures";
import { logConversation } from "@/features/timeline/timeline.slice";
import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import * as opportunitiesApi from "./opportunities.api";
import {
  board,
  defaultQuery,
  fleet,
  inStage,
  opportunityList,
  vision,
  walkIn,
  wonDeal,
} from "./opportunities.fixtures";
import {
  assignOpportunity,
  closeOpportunity,
  createOpportunity,
  deleteOpportunity,
  fetchBoard,
  fetchOpportunities,
  fetchOpportunity,
  moveOpportunity,
  reopenOpportunity,
  updateOpportunity,
} from "./opportunities.slice";
import type { BoardColumn, Opportunity, OpportunityList } from "./opportunities.types";

vi.mock("./opportunities.api");
vi.mock("@/features/timeline/timeline.api");

const list = opportunityList();
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

// A store with the list, the board and one opportunity loaded.
async function loadedStore(current: Opportunity = fleet) {
  vi.mocked(opportunitiesApi.listOpportunities).mockResolvedValue(list);
  vi.mocked(opportunitiesApi.getBoard).mockResolvedValue(board());
  vi.mocked(opportunitiesApi.getOpportunity).mockResolvedValue(current);
  const store = makeStore();
  await store.dispatch(fetchOpportunities(defaultQuery));
  await store.dispatch(fetchBoard({}));
  await store.dispatch(fetchOpportunity(current.id));
  // From here on a reload stays in flight, so a test sees what a change itself did.
  vi.mocked(opportunitiesApi.listOpportunities).mockReset();
  vi.mocked(opportunitiesApi.getBoard).mockReset();
  vi.mocked(opportunitiesApi.listOpportunities).mockReturnValue(new Promise(() => undefined));
  vi.mocked(opportunitiesApi.getBoard).mockReturnValue(new Promise(() => undefined));
  return store;
}

type Store = ReturnType<typeof makeStore>;

function column(store: Store, stageId: string): BoardColumn {
  const found = store
    .getState()
    .opportunities.board.data?.find((candidate) => candidate.stage.id === stageId);
  if (!found) {
    throw new Error("No such column");
  }
  return found;
}

const names = (store: Store, stageId: string) =>
  column(store, stageId).opportunities.map((card) => card.name);

describe("opportunities slice: the list", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data, for the list, the board and the current opportunity", () => {
    expect(makeStore().getState().opportunities).toEqual({
      list: { data: null, status: "idle", error: null, query: null },
      board: { data: null, status: "idle", error: null, query: null },
      current: { data: null, status: "idle", error: null, id: null },
    });
  });

  it("goes loading with the query, then succeeded with the opportunities and the meta", async () => {
    const request = deferred<OpportunityList>();
    vi.mocked(opportunitiesApi.listOpportunities).mockReturnValue(request.promise);
    const store = makeStore();
    const query = { ...defaultQuery, status: "OPEN" as const, page: 2 };

    const pending = store.dispatch(fetchOpportunities(query));
    expect(store.getState().opportunities.list).toMatchObject({ status: "loading", query });
    expect(opportunitiesApi.listOpportunities).toHaveBeenCalledWith(query);

    request.resolve(opportunityList([walkIn], { page: 2, total: 26 }));
    await pending;

    expect(store.getState().opportunities.list).toEqual({
      data: { opportunities: [walkIn], page: 2, pageSize: 25, total: 26 },
      status: "succeeded",
      error: null,
      query,
    });
  });

  it("goes failed and keeps the ApiError code and message", async () => {
    vi.mocked(opportunitiesApi.listOpportunities).mockRejectedValue(forbidden);
    const store = makeStore();

    await store.dispatch(fetchOpportunities(defaultQuery));

    expect(store.getState().opportunities.list).toMatchObject({
      data: null,
      status: "failed",
      error: forbidden,
    });
  });

  it("starts no second request while the same query is loading", async () => {
    const request = deferred<OpportunityList>();
    vi.mocked(opportunitiesApi.listOpportunities).mockReturnValue(request.promise);
    const store = makeStore();

    const first = store.dispatch(fetchOpportunities(defaultQuery));
    const second = store.dispatch(fetchOpportunities({ ...defaultQuery }));
    request.resolve(list);
    await Promise.all([first, second]);

    expect(opportunitiesApi.listOpportunities).toHaveBeenCalledTimes(1);
  });

  it("drops the answer to an older query when a newer one was asked", async () => {
    const slow = deferred<OpportunityList>();
    const fast = deferred<OpportunityList>();
    vi.mocked(opportunitiesApi.listOpportunities)
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);
    const store = makeStore();

    const first = store.dispatch(fetchOpportunities({ ...defaultQuery, search: "fle" }));
    const second = store.dispatch(fetchOpportunities({ ...defaultQuery, search: "fleet" }));
    fast.resolve(opportunityList([fleet]));
    await second;
    slow.resolve(opportunityList([walkIn]));
    await first;

    expect(store.getState().opportunities.list.data?.opportunities).toEqual([fleet]);
  });
});

describe("opportunities slice: the board", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("goes loading with the query, then succeeded with the columns", async () => {
    const request = deferred<BoardColumn[]>();
    vi.mocked(opportunitiesApi.getBoard).mockReturnValue(request.promise);
    const store = makeStore();

    const pending = store.dispatch(fetchBoard({ search: "fleet" }));
    expect(store.getState().opportunities.board).toMatchObject({
      status: "loading",
      query: { search: "fleet" },
    });
    request.resolve(board());
    await pending;

    expect(store.getState().opportunities.board).toMatchObject({
      status: "succeeded",
      data: board(),
      error: null,
    });
  });

  it("goes failed with the ApiError, and starts no second request for the same query", async () => {
    const request = deferred<BoardColumn[]>();
    vi.mocked(opportunitiesApi.getBoard).mockReturnValue(request.promise);
    const store = makeStore();

    const first = store.dispatch(fetchBoard({}));
    const second = store.dispatch(fetchBoard({}));
    request.reject(forbidden);
    await Promise.all([first, second]);

    expect(opportunitiesApi.getBoard).toHaveBeenCalledTimes(1);
    expect(store.getState().opportunities.board).toMatchObject({
      data: null,
      status: "failed",
      error: forbidden,
    });
  });

  it("moves a card at once, before the API has answered, with its count and total", async () => {
    const store = await loadedStore();
    const request = deferred<Opportunity>();
    vi.mocked(opportunitiesApi.moveOpportunity).mockReturnValue(request.promise);

    const pending = store.dispatch(moveOpportunity({ id: fleet.id, stageId: proposalStage.id }));

    expect(names(store, newStage.id)).toEqual(["Walk-in enquiry"]);
    expect(column(store, newStage.id)).toMatchObject({ count: 1, totalValue: 0 });
    expect(column(store, proposalStage.id)).toMatchObject({ count: 1, totalValue: 48000 });
    expect(column(store, proposalStage.id).opportunities[0]).toMatchObject({
      id: fleet.id,
      stage: { id: proposalStage.id, name: "Proposal", kind: "OPEN" },
    });

    const moved = { ...inStage(fleet, proposalStage), updatedAt: "2026-10-09T09:00:00.000Z" };
    request.resolve(moved);
    await pending;

    // The API's answer replaces the card; the board is not asked for again.
    expect(opportunitiesApi.moveOpportunity).toHaveBeenCalledWith(fleet.id, proposalStage.id);
    expect(column(store, proposalStage.id).opportunities).toEqual([moved]);
    expect(column(store, proposalStage.id)).toMatchObject({ count: 1, totalValue: 48000 });
    expect(opportunitiesApi.getBoard).not.toHaveBeenCalled();
    expect(store.getState().opportunities.current.data).toEqual(moved);
  });

  it("puts the card back where it was when the API refuses the move", async () => {
    const store = await loadedStore();
    const before = store.getState().opportunities.board.data;
    const request = deferred<Opportunity>();
    vi.mocked(opportunitiesApi.moveOpportunity).mockReturnValue(request.promise);

    // Walk-in enquiry is the second card of New.
    const pending = store.dispatch(moveOpportunity({ id: walkIn.id, stageId: qualifiedStage.id }));
    expect(names(store, qualifiedStage.id)).toEqual(["Walk-in enquiry", "Vision Platform"]);

    request.reject(forbidden);
    const result = await pending;

    expect(result.payload).toEqual(forbidden);
    expect(store.getState().opportunities.board.data).toEqual(before);
    expect(names(store, newStage.id)).toEqual(["Fleet Expansion", "Walk-in enquiry"]);
  });

  it("keeps a column's total exact when cents move in and out", async () => {
    const store = await loadedStore();
    vi.mocked(opportunitiesApi.moveOpportunity).mockResolvedValue(inStage(vision, newStage));

    await store.dispatch(moveOpportunity({ id: vision.id, stageId: newStage.id }));

    expect(column(store, newStage.id)).toMatchObject({ count: 3, totalValue: 49250.5 });
    expect(column(store, qualifiedStage.id)).toMatchObject({ count: 0, totalValue: 0 });
  });

  it("moves a closed card to its Won column, then reloads the board and the list", async () => {
    const store = await loadedStore();
    const closed: Opportunity = {
      ...inStage(fleet, wonStage),
      closeReason: "Signed.",
      closedAt: "2026-10-09T09:00:00.000Z",
    };
    vi.mocked(opportunitiesApi.closeOpportunity).mockResolvedValue(closed);

    await store.dispatch(
      closeOpportunity({ id: fleet.id, input: { outcome: "WON", reason: "Signed." } }),
    );

    expect(opportunitiesApi.closeOpportunity).toHaveBeenCalledWith(fleet.id, {
      outcome: "WON",
      reason: "Signed.",
    });
    expect(names(store, wonStage.id)).toEqual(["Fleet Expansion", "Guest App"]);
    expect(column(store, wonStage.id)).toMatchObject({ count: 2, totalValue: 144000 });
    expect(names(store, newStage.id)).toEqual(["Walk-in enquiry"]);
    expect(store.getState().opportunities.current.data).toEqual(closed);
    expect(store.getState().opportunities.list.data?.opportunities[0]).toEqual(closed);
    expect(opportunitiesApi.getBoard).toHaveBeenCalledWith({});
    expect(opportunitiesApi.listOpportunities).toHaveBeenCalledWith(defaultQuery);
  });

  it("reopens a closed card into the stage the API chose", async () => {
    const store = await loadedStore(wonDeal);
    vi.mocked(opportunitiesApi.reopenOpportunity).mockResolvedValue({
      ...inStage(wonDeal, newStage),
      closeReason: null,
      closedAt: null,
    });

    await store.dispatch(reopenOpportunity(wonDeal.id));

    expect(names(store, wonStage.id)).toEqual([]);
    expect(names(store, newStage.id)[0]).toBe("Guest App");
    expect(store.getState().opportunities.current.data?.status).toBe("OPEN");
  });

  it("replaces a changed card where it is, and takes a deleted one off the board", async () => {
    const store = await loadedStore();
    vi.mocked(opportunitiesApi.updateOpportunity).mockResolvedValue({ ...walkIn, value: 500 });
    vi.mocked(opportunitiesApi.assignOpportunity).mockResolvedValue(fleet);
    vi.mocked(opportunitiesApi.deleteOpportunity).mockResolvedValue();

    await store.dispatch(updateOpportunity({ id: walkIn.id, changes: { value: 500 } }));
    expect(names(store, newStage.id)).toEqual(["Fleet Expansion", "Walk-in enquiry"]);
    expect(column(store, newStage.id).totalValue).toBe(48500);

    await store.dispatch(assignOpportunity({ id: fleet.id, ownerId: "someone" }));
    expect(opportunitiesApi.assignOpportunity).toHaveBeenCalledWith(fleet.id, "someone");

    await store.dispatch(deleteOpportunity(fleet.id));
    expect(names(store, newStage.id)).toEqual(["Walk-in enquiry"]);
    expect(column(store, newStage.id)).toMatchObject({ count: 1, totalValue: 500 });
    expect(store.getState().opportunities.current).toMatchObject({ data: null, id: null });
    expect(
      store.getState().opportunities.list.data?.opportunities.map((opportunity) => opportunity.id),
    ).not.toContain(fleet.id);
  });

  it("reloads the list and the board after creating an opportunity", async () => {
    const store = await loadedStore();
    vi.mocked(opportunitiesApi.createOpportunity).mockResolvedValue(walkIn);

    await store.dispatch(createOpportunity({ name: "Walk-in enquiry" }));

    expect(opportunitiesApi.listOpportunities).toHaveBeenCalledWith(defaultQuery);
    expect(opportunitiesApi.getBoard).toHaveBeenCalledWith({});
  });

  it("leaves status and error alone when a change is refused", async () => {
    const store = await loadedStore();
    vi.mocked(opportunitiesApi.closeOpportunity).mockRejectedValue(forbidden);

    const result = await store.dispatch(
      closeOpportunity({ id: fleet.id, input: { outcome: "LOST", reason: "x" } }),
    );

    expect(result.payload).toEqual(forbidden);
    expect(store.getState().opportunities.board).toMatchObject({
      status: "succeeded",
      error: null,
    });
    expect(store.getState().opportunities.list).toMatchObject({ status: "succeeded", error: null });
  });
});

describe("opportunities slice: the current opportunity", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads one opportunity, and never shows it under another id", async () => {
    const store = await loadedStore();
    const request = deferred<Opportunity>();
    vi.mocked(opportunitiesApi.getOpportunity).mockReturnValue(request.promise);

    const pending = store.dispatch(fetchOpportunity(vision.id));
    expect(store.getState().opportunities.current).toMatchObject({
      data: null,
      status: "loading",
      id: vision.id,
    });
    request.reject({ code: "NOT_FOUND", message: "x", details: null });
    await pending;

    expect(store.getState().opportunities.current).toMatchObject({
      data: null,
      status: "failed",
      error: { code: "NOT_FOUND" },
    });
  });

  it("moves Last contact forward for a conversation on this opportunity only", async () => {
    const store = await loadedStore(walkIn);
    const input = { type: "CALL", occurredAt: "2026-10-09T10:00:00.000Z", summary: "x" } as const;
    vi.mocked(timelineApi.logConversation).mockResolvedValue(
      savedEntry({ kind: "CONVERSATION", conversationType: "CALL", occurredAt: input.occurredAt }),
    );

    await store.dispatch(logConversation({ record: { type: "contact", id: walkIn.id }, input }));
    expect(store.getState().opportunities.current.data?.lastContactAt).toBeNull();

    await store.dispatch(
      logConversation({ record: { type: "opportunity", id: walkIn.id }, input }),
    );
    expect(store.getState().opportunities.current.data?.lastContactAt).toBe(input.occurredAt);
  });
});
