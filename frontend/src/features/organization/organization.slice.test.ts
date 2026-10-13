import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import * as organizationApi from "./organization.api";
import { organization, unsavedOrganization } from "./organization.fixtures";
import { fetchOrganization, saveOrganization } from "./organization.slice";
import type { OrganizationSettings } from "./organization.types";

vi.mock("./organization.api");

const forbidden: ApiError = { code: "FORBIDDEN", message: "Server text", details: null };

// A promise the test resolves by hand, so a request can stay "in flight".
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("organization slice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data and no error", () => {
    expect(makeStore().getState().organization).toEqual({
      data: null,
      status: "idle",
      error: null,
    });
  });

  it("goes loading, then succeeded with the settings", async () => {
    const request = deferred<OrganizationSettings>();
    vi.mocked(organizationApi.getOrganization).mockReturnValue(request.promise);
    const store = makeStore();

    const pending = store.dispatch(fetchOrganization());
    expect(store.getState().organization.status).toBe("loading");

    request.resolve(organization);
    await pending;
    expect(store.getState().organization).toEqual({
      data: organization,
      status: "succeeded",
      error: null,
    });
  });

  it("goes failed and keeps the ApiError code and message", async () => {
    vi.mocked(organizationApi.getOrganization).mockRejectedValue(forbidden);
    const store = makeStore();

    await store.dispatch(fetchOrganization());

    expect(store.getState().organization).toEqual({
      data: null,
      status: "failed",
      error: forbidden,
    });
  });

  it("starts no second request while one is loading", async () => {
    const request = deferred<OrganizationSettings>();
    vi.mocked(organizationApi.getOrganization).mockReturnValue(request.promise);
    const store = makeStore();

    const first = store.dispatch(fetchOrganization());
    const second = store.dispatch(fetchOrganization());
    request.resolve(organization);
    await Promise.all([first, second]);

    expect(organizationApi.getOrganization).toHaveBeenCalledTimes(1);
  });

  it("replaces the settings with the answer to a save", async () => {
    vi.mocked(organizationApi.getOrganization).mockResolvedValue(unsavedOrganization);
    vi.mocked(organizationApi.saveOrganization).mockResolvedValue(organization);
    const store = makeStore();
    await store.dispatch(fetchOrganization());

    await store.dispatch(saveOrganization({ ...organization }));

    expect(store.getState().organization.data).toEqual(organization);
  });

  it("leaves the settings alone when a save is refused, and hands over the error", async () => {
    vi.mocked(organizationApi.getOrganization).mockResolvedValue(organization);
    vi.mocked(organizationApi.saveOrganization).mockRejectedValue(forbidden);
    const store = makeStore();
    await store.dispatch(fetchOrganization());

    const result = await store.dispatch(saveOrganization({ ...organization, name: "Other" }));

    expect(result.payload).toEqual(forbidden);
    expect(store.getState().organization).toEqual({
      data: organization,
      status: "succeeded",
      error: null,
    });
  });
});
