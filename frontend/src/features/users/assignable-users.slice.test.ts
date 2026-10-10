import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import { fetchAssignableUsers } from "./assignable-users.slice";
import * as usersApi from "./users.api";
import type { AssignableUser } from "./users.types";

vi.mock("./users.api");

const owners: AssignableUser[] = [
  { id: "u1", name: "Mia Manager", role: "SALES_MANAGER" },
  { id: "u2", name: "Rob Rep", role: "SALES_REP" },
];

describe("assignable users slice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data and no error", () => {
    expect(makeStore().getState().assignableUsers).toEqual({
      data: null,
      status: "idle",
      error: null,
    });
  });

  it("goes loading, then succeeded with the possible owners", async () => {
    let resolve: (value: AssignableUser[]) => void = () => undefined;
    vi.mocked(usersApi.listAssignableUsers).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const store = makeStore();

    const first = store.dispatch(fetchAssignableUsers());
    expect(store.getState().assignableUsers.status).toBe("loading");
    // No second request starts while one is loading.
    const second = store.dispatch(fetchAssignableUsers());
    resolve(owners);
    await Promise.all([first, second]);

    expect(usersApi.listAssignableUsers).toHaveBeenCalledTimes(1);
    expect(store.getState().assignableUsers).toEqual({
      data: owners,
      status: "succeeded",
      error: null,
    });
  });

  it("goes failed and keeps the ApiError code and message", async () => {
    const failure: ApiError = { code: "NETWORK_ERROR", message: "Server text", details: null };
    vi.mocked(usersApi.listAssignableUsers).mockRejectedValue(failure);
    const store = makeStore();

    await store.dispatch(fetchAssignableUsers());

    expect(store.getState().assignableUsers).toEqual({
      data: null,
      status: "failed",
      error: failure,
    });
  });
});
