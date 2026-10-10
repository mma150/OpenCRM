import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import * as leadsApi from "./leads.api";
import { defaultQuery, devon, leadList, liam, marcus } from "./leads.fixtures";
import {
  assignLead,
  createLead,
  deleteLead,
  fetchLead,
  fetchLeads,
  markLeadLost,
  updateLead,
} from "./leads.slice";
import type { Lead, LeadList, LeadListQuery } from "./leads.types";

vi.mock("./leads.api");

const list = leadList([marcus, liam, devon]);
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

async function loadedStore() {
  vi.mocked(leadsApi.listLeads).mockResolvedValue(list);
  const store = makeStore();
  await store.dispatch(fetchLeads(defaultQuery));
  vi.mocked(leadsApi.listLeads).mockClear();
  return store;
}

describe("leads slice: the list", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data, no error and no query, for the list and the current lead", () => {
    expect(makeStore().getState().leads).toEqual({
      list: { data: null, status: "idle", error: null, query: null },
      current: { data: null, status: "idle", error: null, id: null },
    });
  });

  it("goes loading with the query, then succeeded with the leads and the meta", async () => {
    const request = deferred<LeadList>();
    vi.mocked(leadsApi.listLeads).mockReturnValue(request.promise);
    const store = makeStore();
    const query: LeadListQuery = { ...defaultQuery, status: "NEW", page: 2 };

    const pending = store.dispatch(fetchLeads(query));
    expect(store.getState().leads.list).toMatchObject({ status: "loading", query });
    expect(leadsApi.listLeads).toHaveBeenCalledWith(query);

    request.resolve(leadList([liam], { page: 2, total: 26 }));
    await pending;

    expect(store.getState().leads.list).toEqual({
      data: { leads: [liam], page: 2, pageSize: 25, total: 26 },
      status: "succeeded",
      error: null,
      query,
    });
  });

  it("goes failed and keeps the ApiError code and message", async () => {
    vi.mocked(leadsApi.listLeads).mockRejectedValue(forbidden);
    const store = makeStore();

    await store.dispatch(fetchLeads(defaultQuery));

    expect(store.getState().leads.list).toMatchObject({
      data: null,
      status: "failed",
      error: forbidden,
    });
  });

  it("keeps the last page while a reload is running, and when it fails", async () => {
    const store = await loadedStore();
    const request = deferred<LeadList>();
    vi.mocked(leadsApi.listLeads).mockReturnValue(request.promise);

    const pending = store.dispatch(fetchLeads({ ...defaultQuery, page: 2 }));
    expect(store.getState().leads.list).toMatchObject({ data: list, status: "loading" });

    request.reject(forbidden);
    await pending;
    expect(store.getState().leads.list).toMatchObject({ data: list, status: "failed" });
  });

  it("starts no second request while the same query is loading", async () => {
    const request = deferred<LeadList>();
    vi.mocked(leadsApi.listLeads).mockReturnValue(request.promise);
    const store = makeStore();

    const first = store.dispatch(fetchLeads(defaultQuery));
    const second = store.dispatch(fetchLeads({ ...defaultQuery }));
    request.resolve(list);
    await Promise.all([first, second]);

    expect(leadsApi.listLeads).toHaveBeenCalledTimes(1);
  });

  it("lets a different query through while loading, and drops the older answer", async () => {
    const slow = deferred<LeadList>();
    const fast = deferred<LeadList>();
    vi.mocked(leadsApi.listLeads)
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);
    const store = makeStore();
    const newer: LeadListQuery = { ...defaultQuery, search: "liam" };

    const first = store.dispatch(fetchLeads(defaultQuery));
    const second = store.dispatch(fetchLeads(newer));
    expect(leadsApi.listLeads).toHaveBeenCalledTimes(2);

    fast.resolve(leadList([liam]));
    await second;
    // The answer to the first, older query arrives last and must not replace the newer one.
    slow.resolve(list);
    await first;

    expect(store.getState().leads.list).toMatchObject({
      data: leadList([liam]),
      status: "succeeded",
      query: newer,
    });
  });
});

describe("leads slice: the current lead", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("goes loading with the id, then succeeded with the lead", async () => {
    const request = deferred<Lead>();
    vi.mocked(leadsApi.getLead).mockReturnValue(request.promise);
    const store = makeStore();

    const pending = store.dispatch(fetchLead(marcus.id));
    expect(store.getState().leads.current).toMatchObject({ status: "loading", id: marcus.id });

    request.resolve(marcus);
    await pending;

    expect(store.getState().leads.current).toEqual({
      data: marcus,
      status: "succeeded",
      error: null,
      id: marcus.id,
    });
  });

  it("goes failed with NOT_FOUND for a lead that is missing or not visible", async () => {
    const notFound: ApiError = { code: "NOT_FOUND", message: "Lead not found", details: null };
    vi.mocked(leadsApi.getLead).mockRejectedValue(notFound);
    const store = makeStore();

    await store.dispatch(fetchLead(marcus.id));

    expect(store.getState().leads.current).toMatchObject({
      data: null,
      status: "failed",
      error: notFound,
    });
  });

  it("starts no second request while the same lead is loading", async () => {
    const request = deferred<Lead>();
    vi.mocked(leadsApi.getLead).mockReturnValue(request.promise);
    const store = makeStore();

    const first = store.dispatch(fetchLead(marcus.id));
    const second = store.dispatch(fetchLead(marcus.id));
    request.resolve(marcus);
    await Promise.all([first, second]);

    expect(leadsApi.getLead).toHaveBeenCalledTimes(1);
  });

  it("keeps the lead while it is reloaded, but never shows it for another id", async () => {
    vi.mocked(leadsApi.getLead).mockResolvedValue(marcus);
    const store = makeStore();
    await store.dispatch(fetchLead(marcus.id));

    const request = deferred<Lead>();
    vi.mocked(leadsApi.getLead).mockReturnValue(request.promise);
    const reload = store.dispatch(fetchLead(marcus.id));
    expect(store.getState().leads.current.data).toEqual(marcus);
    request.resolve(marcus);
    await reload;

    const other = deferred<Lead>();
    vi.mocked(leadsApi.getLead).mockReturnValue(other.promise);
    const next = store.dispatch(fetchLead(liam.id));
    expect(store.getState().leads.current).toMatchObject({ data: null, id: liam.id });
    other.resolve(liam);
    await next;
    expect(store.getState().leads.current.data).toEqual(liam);
  });
});

describe("leads slice: mutations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const leadsInStore = (store: ReturnType<typeof makeStore>) =>
    store.getState().leads.list.data?.leads;

  it("createLead returns the new lead and reloads the list with its last query", async () => {
    const store = await loadedStore();
    const created = { ...liam, id: "new-lead" };
    vi.mocked(leadsApi.createLead).mockResolvedValue(created);
    vi.mocked(leadsApi.listLeads).mockResolvedValue(leadList([created, marcus, liam, devon]));
    const input = { firstName: "Liam", lastName: "Gallagher", source: "COLD_CALL" } as const;

    const result = await store.dispatch(createLead(input)).unwrap();

    expect(result).toEqual(created);
    expect(leadsApi.createLead).toHaveBeenCalledWith(input);
    expect(leadsApi.listLeads).toHaveBeenCalledWith(defaultQuery);
    await vi.waitFor(() => {
      expect(leadsInStore(store)).toEqual([created, marcus, liam, devon]);
    });
  });

  it("does not load a list that was never opened", async () => {
    vi.mocked(leadsApi.createLead).mockResolvedValue(liam);
    const store = makeStore();

    await store.dispatch(createLead({ firstName: "Liam", lastName: "G", source: "OTHER" }));

    expect(leadsApi.listLeads).not.toHaveBeenCalled();
  });

  it("updateLead shows the returned lead at once, in the list and as the current lead", async () => {
    const store = await loadedStore();
    vi.mocked(leadsApi.getLead).mockResolvedValue(marcus);
    await store.dispatch(fetchLead(marcus.id));
    const qualified: Lead = { ...marcus, status: "QUALIFIED" };
    vi.mocked(leadsApi.updateLead).mockResolvedValue(qualified);
    // The reload stays in flight, so what is checked is the immediate update.
    vi.mocked(leadsApi.listLeads).mockReturnValue(deferred<LeadList>().promise);

    await store.dispatch(updateLead({ id: marcus.id, changes: { status: "QUALIFIED" } })).unwrap();

    expect(leadsApi.updateLead).toHaveBeenCalledWith(marcus.id, { status: "QUALIFIED" });
    expect(leadsInStore(store)).toEqual([qualified, liam, devon]);
    expect(store.getState().leads.current.data).toEqual(qualified);
    expect(leadsApi.listLeads).toHaveBeenCalledTimes(1);
  });

  it("does not touch the current lead when another lead changes", async () => {
    const store = await loadedStore();
    vi.mocked(leadsApi.getLead).mockResolvedValue(liam);
    await store.dispatch(fetchLead(liam.id));
    vi.mocked(leadsApi.updateLead).mockResolvedValue({ ...marcus, status: "QUALIFIED" });
    vi.mocked(leadsApi.listLeads).mockResolvedValue(list);

    await store.dispatch(updateLead({ id: marcus.id, changes: { status: "QUALIFIED" } }));

    expect(store.getState().leads.current.data).toEqual(liam);
  });

  it("markLeadLost sends the reason and note and stores the lost lead", async () => {
    const store = await loadedStore();
    const lost: Lead = { ...marcus, status: "LOST", lostReason: "PRICE", lostNote: "Too dear" };
    vi.mocked(leadsApi.markLeadLost).mockResolvedValue(lost);
    vi.mocked(leadsApi.listLeads).mockReturnValue(deferred<LeadList>().promise);
    const input = { reason: "PRICE", note: "Too dear" } as const;

    await store.dispatch(markLeadLost({ id: marcus.id, input })).unwrap();

    expect(leadsApi.markLeadLost).toHaveBeenCalledWith(marcus.id, input);
    expect(leadsInStore(store)?.[0]).toEqual(lost);
  });

  it("assignLead sends the new owner and stores the reassigned lead", async () => {
    const store = await loadedStore();
    const reassigned: Lead = { ...marcus, owner: { id: "owner-2", name: "Mia Manager" } };
    vi.mocked(leadsApi.assignLead).mockResolvedValue(reassigned);
    vi.mocked(leadsApi.listLeads).mockReturnValue(deferred<LeadList>().promise);

    await store.dispatch(assignLead({ id: marcus.id, ownerId: "owner-2" })).unwrap();

    expect(leadsApi.assignLead).toHaveBeenCalledWith(marcus.id, "owner-2");
    expect(leadsInStore(store)?.[0]?.owner.name).toBe("Mia Manager");
  });

  it("deleteLead removes the lead from the list and clears it as the current lead", async () => {
    const store = await loadedStore();
    vi.mocked(leadsApi.getLead).mockResolvedValue(marcus);
    await store.dispatch(fetchLead(marcus.id));
    vi.mocked(leadsApi.deleteLead).mockResolvedValue();
    vi.mocked(leadsApi.listLeads).mockReturnValue(deferred<LeadList>().promise);

    await store.dispatch(deleteLead(marcus.id)).unwrap();

    expect(leadsApi.deleteLead).toHaveBeenCalledWith(marcus.id);
    expect(leadsInStore(store)).toEqual([liam, devon]);
    expect(store.getState().leads.current).toEqual({
      data: null,
      status: "idle",
      error: null,
      id: null,
    });
    expect(leadsApi.listLeads).toHaveBeenCalledWith(defaultQuery);
  });

  it("a refused mutation rejects with the ApiError and changes nothing", async () => {
    const store = await loadedStore();
    const before = store.getState().leads;
    vi.mocked(leadsApi.assignLead).mockRejectedValue(forbidden);
    vi.mocked(leadsApi.deleteLead).mockRejectedValue(forbidden);

    await expect(
      store.dispatch(assignLead({ id: marcus.id, ownerId: "owner-2" })).unwrap(),
    ).rejects.toEqual(forbidden);
    await expect(store.dispatch(deleteLead(marcus.id)).unwrap()).rejects.toEqual(forbidden);

    expect(store.getState().leads).toEqual(before);
    expect(leadsApi.listLeads).not.toHaveBeenCalled();
  });
});
