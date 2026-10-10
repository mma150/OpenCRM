import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import * as companiesApi from "./companies.api";
import { brightpath, companyList, defaultQuery, industries } from "./companies.fixtures";
import { createCompany, fetchCompanies, fetchIndustries } from "./companies.slice";

vi.mock("./companies.api");

describe("companies slice: the industries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("goes loading, then succeeded with the industries in use", async () => {
    let resolve: (value: string[]) => void = () => undefined;
    vi.mocked(companiesApi.listIndustries).mockReturnValue(
      new Promise<string[]>((done) => {
        resolve = done;
      }),
    );
    const store = makeStore();

    const pending = store.dispatch(fetchIndustries());
    expect(store.getState().companies.industries).toMatchObject({ status: "loading" });
    // No second request starts while one is loading.
    await store.dispatch(fetchIndustries());
    expect(companiesApi.listIndustries).toHaveBeenCalledTimes(1);

    resolve(industries);
    await pending;
    expect(store.getState().companies.industries).toEqual({
      data: industries,
      status: "succeeded",
      error: null,
    });
  });

  it("goes failed and keeps the ApiError", async () => {
    const forbidden: ApiError = { code: "FORBIDDEN", message: "Server text", details: null };
    vi.mocked(companiesApi.listIndustries).mockRejectedValue(forbidden);
    const store = makeStore();

    await store.dispatch(fetchIndustries());

    expect(store.getState().companies.industries).toEqual({
      data: null,
      status: "failed",
      error: forbidden,
    });
  });

  it("loads the industries again after a change, because a company can bring a new one", async () => {
    vi.mocked(companiesApi.listCompanies).mockResolvedValue(companyList());
    vi.mocked(companiesApi.listIndustries).mockResolvedValue(industries);
    const store = makeStore();
    await store.dispatch(fetchCompanies(defaultQuery));
    await store.dispatch(fetchIndustries());
    vi.mocked(companiesApi.createCompany).mockResolvedValue({ ...brightpath, industry: "Dental" });
    vi.mocked(companiesApi.listIndustries).mockResolvedValue(["Dental", ...industries]);

    await store.dispatch(createCompany({ name: "Brightpath Dental", industry: "Dental" }));

    await vi.waitFor(() => {
      expect(store.getState().companies.industries.data).toEqual(["Dental", ...industries]);
    });
  });

  it("does not load industries that were never asked for", async () => {
    vi.mocked(companiesApi.createCompany).mockResolvedValue(brightpath);
    const store = makeStore();

    await store.dispatch(createCompany({ name: "Brightpath Dental" }));

    expect(companiesApi.listIndustries).not.toHaveBeenCalled();
  });
});
