import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import { getHealth } from "./health.api";
import { fetchHealth } from "./health.slice";
import type { Health } from "./health.types";

vi.mock("./health.api");

const firstHealth: Health = {
  status: "ok",
  database: { connected: true, serverTime: "2026-10-08T10:00:00.000Z" },
};
const secondHealth: Health = {
  status: "ok",
  database: { connected: true, serverTime: "2026-10-08T10:00:05.000Z" },
};

// A promise the test resolves by hand, so a request can stay "in flight".
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("health slice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data and no error", () => {
    const store = makeStore();

    expect(store.getState().health).toEqual({ data: null, status: "idle", error: null });
  });

  it("goes loading, then succeeded with the payload", async () => {
    const request = deferred<Health>();
    vi.mocked(getHealth).mockReturnValue(request.promise);
    const store = makeStore();

    const pending = store.dispatch(fetchHealth());
    expect(store.getState().health.status).toBe("loading");

    request.resolve(firstHealth);
    await pending;

    expect(store.getState().health).toEqual({
      data: firstHealth,
      status: "succeeded",
      error: null,
    });
  });

  it("goes failed and keeps the ApiError code and message", async () => {
    const apiError: ApiError = {
      code: "NETWORK_ERROR",
      message: "Could not reach the server",
      details: null,
    };
    vi.mocked(getHealth).mockRejectedValue(apiError);
    const store = makeStore();

    await store.dispatch(fetchHealth());

    const { status, error, data } = store.getState().health;
    expect(status).toBe("failed");
    expect(error?.code).toBe("NETWORK_ERROR");
    expect(error?.message).toBe("Could not reach the server");
    expect(data).toBeNull();
  });

  it("starts no second request while one is loading", async () => {
    const request = deferred<Health>();
    vi.mocked(getHealth).mockReturnValue(request.promise);
    const store = makeStore();

    const first = store.dispatch(fetchHealth());
    const second = store.dispatch(fetchHealth());
    request.resolve(firstHealth);
    await Promise.all([first, second]);

    expect(getHealth).toHaveBeenCalledTimes(1);
    expect(store.getState().health.status).toBe("succeeded");
  });

  it("replaces the data on a dispatch after success instead of duplicating it", async () => {
    vi.mocked(getHealth).mockResolvedValueOnce(firstHealth).mockResolvedValueOnce(secondHealth);
    const store = makeStore();

    await store.dispatch(fetchHealth());
    await store.dispatch(fetchHealth());

    expect(getHealth).toHaveBeenCalledTimes(2);
    expect(store.getState().health).toEqual({
      data: secondHealth,
      status: "succeeded",
      error: null,
    });
  });

  it("clears an earlier error when a retry succeeds", async () => {
    vi.mocked(getHealth)
      .mockRejectedValueOnce({ code: "TIMEOUT", message: "The request timed out", details: null })
      .mockResolvedValueOnce(firstHealth);
    const store = makeStore();

    await store.dispatch(fetchHealth());
    expect(store.getState().health.status).toBe("failed");
    await store.dispatch(fetchHealth());

    expect(store.getState().health).toEqual({
      data: firstHealth,
      status: "succeeded",
      error: null,
    });
  });
});

describe("makeStore", () => {
  it("returns independent stores on every call", async () => {
    vi.mocked(getHealth).mockResolvedValue(firstHealth);
    const first = makeStore();
    const second = makeStore();

    await first.dispatch(fetchHealth());

    expect(first).not.toBe(second);
    expect(first.getState().health.status).toBe("succeeded");
    expect(second.getState().health.status).toBe("idle");
  });
});
