import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import * as companiesApi from "./companies.api";
import { brightpath, companyList, defaultQuery, kestrel, northwind } from "./companies.fixtures";
import {
  assignCompany,
  createCompany,
  deleteCompany,
  fetchCompanies,
  fetchCompany,
  updateCompany,
} from "./companies.slice";
import type { Company, CompanyList, CompanyListQuery } from "./companies.types";

vi.mock("./companies.api");

const list = companyList([northwind, brightpath, kestrel]);
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
  vi.mocked(companiesApi.listCompanies).mockResolvedValue(list);
  const store = makeStore();
  await store.dispatch(fetchCompanies(defaultQuery));
  vi.mocked(companiesApi.listCompanies).mockClear();
  return store;
}

describe("companies slice: the list", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data, no error and no query, for the list and the current company", () => {
    expect(makeStore().getState().companies).toEqual({
      list: { data: null, status: "idle", error: null, query: null },
      current: { data: null, status: "idle", error: null, id: null },
      industries: { data: null, status: "idle", error: null },
    });
  });

  it("goes loading with the query, then succeeded with the companies and the meta", async () => {
    const request = deferred<CompanyList>();
    vi.mocked(companiesApi.listCompanies).mockReturnValue(request.promise);
    const store = makeStore();
    const query: CompanyListQuery = { ...defaultQuery, industry: "Logistics", page: 2 };

    const pending = store.dispatch(fetchCompanies(query));
    expect(store.getState().companies.list).toMatchObject({ status: "loading", query });
    expect(companiesApi.listCompanies).toHaveBeenCalledWith(query);

    request.resolve(companyList([brightpath], { page: 2, total: 26 }));
    await pending;

    expect(store.getState().companies.list).toEqual({
      data: { companies: [brightpath], page: 2, pageSize: 25, total: 26 },
      status: "succeeded",
      error: null,
      query,
    });
  });

  it("goes failed and keeps the ApiError code and message", async () => {
    vi.mocked(companiesApi.listCompanies).mockRejectedValue(forbidden);
    const store = makeStore();

    await store.dispatch(fetchCompanies(defaultQuery));

    expect(store.getState().companies.list).toMatchObject({
      data: null,
      status: "failed",
      error: forbidden,
    });
  });

  it("keeps the last page while a reload is running, and when it fails", async () => {
    const store = await loadedStore();
    const request = deferred<CompanyList>();
    vi.mocked(companiesApi.listCompanies).mockReturnValue(request.promise);

    const pending = store.dispatch(fetchCompanies({ ...defaultQuery, page: 2 }));
    expect(store.getState().companies.list).toMatchObject({ data: list, status: "loading" });

    request.reject(forbidden);
    await pending;
    expect(store.getState().companies.list).toMatchObject({ data: list, status: "failed" });
  });

  it("starts no second request while the same query is loading", async () => {
    const request = deferred<CompanyList>();
    vi.mocked(companiesApi.listCompanies).mockReturnValue(request.promise);
    const store = makeStore();

    const first = store.dispatch(fetchCompanies(defaultQuery));
    const second = store.dispatch(fetchCompanies({ ...defaultQuery }));
    request.resolve(list);
    await Promise.all([first, second]);

    expect(companiesApi.listCompanies).toHaveBeenCalledTimes(1);
  });

  it("lets a different query through while loading, and drops the older answer", async () => {
    const slow = deferred<CompanyList>();
    const fast = deferred<CompanyList>();
    vi.mocked(companiesApi.listCompanies)
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);
    const store = makeStore();
    const newer: CompanyListQuery = { ...defaultQuery, search: "bright" };

    const first = store.dispatch(fetchCompanies(defaultQuery));
    const second = store.dispatch(fetchCompanies(newer));
    expect(companiesApi.listCompanies).toHaveBeenCalledTimes(2);

    fast.resolve(companyList([brightpath]));
    await second;
    // The answer to the first, older query arrives last and must not replace the newer one.
    slow.resolve(list);
    await first;

    expect(store.getState().companies.list).toMatchObject({
      data: companyList([brightpath]),
      status: "succeeded",
      query: newer,
    });
  });
});

describe("companies slice: the current company", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("goes loading with the id, then succeeded with the company", async () => {
    const request = deferred<Company>();
    vi.mocked(companiesApi.getCompany).mockReturnValue(request.promise);
    const store = makeStore();

    const pending = store.dispatch(fetchCompany(northwind.id));
    expect(store.getState().companies.current).toMatchObject({
      status: "loading",
      id: northwind.id,
    });

    request.resolve(northwind);
    await pending;

    expect(store.getState().companies.current).toEqual({
      data: northwind,
      status: "succeeded",
      error: null,
      id: northwind.id,
    });
  });

  it("goes failed with NOT_FOUND for a company that is missing or not visible", async () => {
    const notFound: ApiError = { code: "NOT_FOUND", message: "Company not found", details: null };
    vi.mocked(companiesApi.getCompany).mockRejectedValue(notFound);
    const store = makeStore();

    await store.dispatch(fetchCompany(northwind.id));

    expect(store.getState().companies.current).toMatchObject({
      data: null,
      status: "failed",
      error: notFound,
    });
  });

  it("starts no second request while the same company is loading", async () => {
    const request = deferred<Company>();
    vi.mocked(companiesApi.getCompany).mockReturnValue(request.promise);
    const store = makeStore();

    const first = store.dispatch(fetchCompany(northwind.id));
    const second = store.dispatch(fetchCompany(northwind.id));
    request.resolve(northwind);
    await Promise.all([first, second]);

    expect(companiesApi.getCompany).toHaveBeenCalledTimes(1);
  });

  it("keeps the company while it is reloaded, but never shows it for another id", async () => {
    vi.mocked(companiesApi.getCompany).mockResolvedValue(northwind);
    const store = makeStore();
    await store.dispatch(fetchCompany(northwind.id));

    const request = deferred<Company>();
    vi.mocked(companiesApi.getCompany).mockReturnValue(request.promise);
    const reload = store.dispatch(fetchCompany(northwind.id));
    expect(store.getState().companies.current.data).toEqual(northwind);
    request.resolve(northwind);
    await reload;

    const other = deferred<Company>();
    vi.mocked(companiesApi.getCompany).mockReturnValue(other.promise);
    const next = store.dispatch(fetchCompany(brightpath.id));
    expect(store.getState().companies.current).toMatchObject({ data: null, id: brightpath.id });
    other.resolve(brightpath);
    await next;
    expect(store.getState().companies.current.data).toEqual(brightpath);
  });
});

describe("companies slice: mutations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const companiesInStore = (store: ReturnType<typeof makeStore>) =>
    store.getState().companies.list.data?.companies;

  it("createCompany returns the new company and reloads the list with its last query", async () => {
    const store = await loadedStore();
    const created = { ...brightpath, id: "new-company" };
    vi.mocked(companiesApi.createCompany).mockResolvedValue(created);
    vi.mocked(companiesApi.listCompanies).mockResolvedValue(
      companyList([created, northwind, brightpath, kestrel]),
    );
    const input = { name: "Brightpath Dental" };

    const result = await store.dispatch(createCompany(input)).unwrap();

    expect(result).toEqual(created);
    expect(companiesApi.createCompany).toHaveBeenCalledWith(input);
    expect(companiesApi.listCompanies).toHaveBeenCalledWith(defaultQuery);
    await vi.waitFor(() => {
      expect(companiesInStore(store)).toEqual([created, northwind, brightpath, kestrel]);
    });
  });

  it("does not load a list that was never opened", async () => {
    vi.mocked(companiesApi.createCompany).mockResolvedValue(brightpath);
    const store = makeStore();

    await store.dispatch(createCompany({ name: "Brightpath" }));

    expect(companiesApi.listCompanies).not.toHaveBeenCalled();
  });

  it("updateCompany shows the returned company at once, in the list and as the current company", async () => {
    const store = await loadedStore();
    vi.mocked(companiesApi.getCompany).mockResolvedValue(northwind);
    await store.dispatch(fetchCompany(northwind.id));
    const changed: Company = { ...northwind, industry: "Freight" };
    vi.mocked(companiesApi.updateCompany).mockResolvedValue(changed);
    // The reload stays in flight, so what is checked is the immediate update.
    vi.mocked(companiesApi.listCompanies).mockReturnValue(deferred<CompanyList>().promise);

    await store
      .dispatch(updateCompany({ id: northwind.id, changes: { industry: "Freight" } }))
      .unwrap();

    expect(companiesApi.updateCompany).toHaveBeenCalledWith(northwind.id, { industry: "Freight" });
    expect(companiesInStore(store)).toEqual([changed, brightpath, kestrel]);
    expect(store.getState().companies.current.data).toEqual(changed);
    expect(companiesApi.listCompanies).toHaveBeenCalledTimes(1);
  });

  it("does not touch the current company when another company changes", async () => {
    const store = await loadedStore();
    vi.mocked(companiesApi.getCompany).mockResolvedValue(brightpath);
    await store.dispatch(fetchCompany(brightpath.id));
    vi.mocked(companiesApi.updateCompany).mockResolvedValue({ ...northwind, industry: "Freight" });
    vi.mocked(companiesApi.listCompanies).mockResolvedValue(list);

    await store.dispatch(updateCompany({ id: northwind.id, changes: { industry: "Freight" } }));

    expect(store.getState().companies.current.data).toEqual(brightpath);
  });

  it("assignCompany sends the new owner and stores the reassigned company", async () => {
    const store = await loadedStore();
    const reassigned: Company = { ...northwind, owner: { id: "owner-2", name: "Mia Manager" } };
    vi.mocked(companiesApi.assignCompany).mockResolvedValue(reassigned);
    vi.mocked(companiesApi.listCompanies).mockReturnValue(deferred<CompanyList>().promise);

    await store.dispatch(assignCompany({ id: northwind.id, ownerId: "owner-2" })).unwrap();

    expect(companiesApi.assignCompany).toHaveBeenCalledWith(northwind.id, "owner-2");
    expect(companiesInStore(store)?.[0]?.owner.name).toBe("Mia Manager");
  });

  it("deleteCompany removes the company from the list and clears it as the current company", async () => {
    const store = await loadedStore();
    vi.mocked(companiesApi.getCompany).mockResolvedValue(northwind);
    await store.dispatch(fetchCompany(northwind.id));
    vi.mocked(companiesApi.deleteCompany).mockResolvedValue();
    vi.mocked(companiesApi.listCompanies).mockReturnValue(deferred<CompanyList>().promise);

    await store.dispatch(deleteCompany(northwind.id)).unwrap();

    expect(companiesApi.deleteCompany).toHaveBeenCalledWith(northwind.id);
    expect(companiesInStore(store)).toEqual([brightpath, kestrel]);
    expect(store.getState().companies.current).toEqual({
      data: null,
      status: "idle",
      error: null,
      id: null,
    });
    expect(companiesApi.listCompanies).toHaveBeenCalledWith(defaultQuery);
  });

  it("a refused mutation rejects with the ApiError and changes nothing", async () => {
    const store = await loadedStore();
    const before = store.getState().companies;
    vi.mocked(companiesApi.assignCompany).mockRejectedValue(forbidden);
    vi.mocked(companiesApi.deleteCompany).mockRejectedValue(forbidden);

    await expect(
      store.dispatch(assignCompany({ id: northwind.id, ownerId: "owner-2" })).unwrap(),
    ).rejects.toEqual(forbidden);
    await expect(store.dispatch(deleteCompany(northwind.id)).unwrap()).rejects.toEqual(forbidden);

    expect(store.getState().companies).toEqual(before);
    expect(companiesApi.listCompanies).not.toHaveBeenCalled();
  });
});
