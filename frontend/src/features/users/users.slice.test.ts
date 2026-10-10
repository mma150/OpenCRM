import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import * as usersApi from "./users.api";
import { admin, invited, manager, rep } from "./users.fixtures";
import {
  deactivateUser,
  fetchUsers,
  inviteUser,
  reactivateUser,
  resendInvite,
  updateUser,
} from "./users.slice";
import type { UserList } from "./users.types";

vi.mock("./users.api");

const list: UserList = { users: [admin, manager, rep], mailEnabled: false };

// A promise the test resolves by hand, so a request can stay "in flight".
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function loadedStore() {
  vi.mocked(usersApi.listUsers).mockResolvedValue(list);
  const store = makeStore();
  await store.dispatch(fetchUsers());
  return store;
}

describe("users slice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data and no error", () => {
    expect(makeStore().getState().users).toEqual({ data: null, status: "idle", error: null });
  });

  it("goes loading, then succeeded with the users and mailEnabled", async () => {
    const request = deferred<UserList>();
    vi.mocked(usersApi.listUsers).mockReturnValue(request.promise);
    const store = makeStore();

    const pending = store.dispatch(fetchUsers());
    expect(store.getState().users.status).toBe("loading");

    request.resolve(list);
    await pending;

    expect(store.getState().users).toEqual({ data: list, status: "succeeded", error: null });
  });

  it("goes failed and keeps the ApiError code and message", async () => {
    const forbidden: ApiError = { code: "FORBIDDEN", message: "Admins only", details: null };
    vi.mocked(usersApi.listUsers).mockRejectedValue(forbidden);
    const store = makeStore();

    await store.dispatch(fetchUsers());

    const { status, error, data } = store.getState().users;
    expect(status).toBe("failed");
    expect(error).toEqual(forbidden);
    expect(data).toBeNull();
  });

  it("starts no second request while one is loading", async () => {
    const request = deferred<UserList>();
    vi.mocked(usersApi.listUsers).mockReturnValue(request.promise);
    const store = makeStore();

    const first = store.dispatch(fetchUsers());
    const second = store.dispatch(fetchUsers());
    request.resolve(list);
    await Promise.all([first, second]);

    expect(usersApi.listUsers).toHaveBeenCalledTimes(1);
  });

  // After a change the slice shows the returned user at once, then reloads the list. The
  // tests answer that reload the way the server would: with the list as it now is.
  function serverListBecomes(users: UserList["users"]) {
    vi.mocked(usersApi.listUsers).mockClear();
    vi.mocked(usersApi.listUsers).mockResolvedValue({ users, mailEnabled: false });
  }
  const usersInStore = (store: ReturnType<typeof makeStore>) => store.getState().users.data?.users;

  it("inviteUser adds the new user and returns the invite link", async () => {
    const store = await loadedStore();
    const invite = { emailed: false, link: "http://localhost:3000/accept-invite?token=abc" };
    vi.mocked(usersApi.inviteUser).mockResolvedValue({ user: invited, invite });
    serverListBecomes([admin, manager, rep, invited]);

    const result = await store
      .dispatch(inviteUser({ name: invited.name, email: invited.email, role: invited.role }))
      .unwrap();

    expect(result.invite).toEqual(invite);
    await vi.waitFor(() => {
      expect(store.getState().users.status).toBe("succeeded");
    });
    expect(usersInStore(store)).toEqual([admin, manager, rep, invited]);
  });

  it("shows the returned user at once, before the reload has answered", async () => {
    const store = await loadedStore();
    const renamed = { ...manager, name: "Mia Renamed" };
    vi.mocked(usersApi.updateUser).mockResolvedValue({ user: renamed, reassignedReports: 0 });
    const reload = deferred<UserList>();
    vi.mocked(usersApi.listUsers).mockClear();
    vi.mocked(usersApi.listUsers).mockReturnValue(reload.promise);

    await store.dispatch(updateUser({ id: manager.id, changes: { name: "Mia Renamed" } })).unwrap();

    expect(usersApi.updateUser).toHaveBeenCalledWith(manager.id, { name: "Mia Renamed" });
    expect(usersInStore(store)).toEqual([admin, renamed, rep]);
    expect(usersApi.listUsers).toHaveBeenCalledTimes(1);
  });

  it("updateUser reloads the list, because one change can show on other rows", async () => {
    const store = await loadedStore();
    const renamed = { ...manager, name: "Mia Renamed" };
    const repAfter = { ...rep, manager: { id: manager.id, name: "Mia Renamed", status: "ACTIVE" } };
    vi.mocked(usersApi.updateUser).mockResolvedValue({ user: renamed, reassignedReports: 0 });
    serverListBecomes([admin, renamed, repAfter] as UserList["users"]);

    await store.dispatch(updateUser({ id: manager.id, changes: { name: "Mia Renamed" } })).unwrap();

    await vi.waitFor(() => {
      expect(usersInStore(store)).toEqual([admin, renamed, repAfter]);
    });
  });

  it("deactivateUser and reactivateUser replace the user with the server's answer", async () => {
    const store = await loadedStore();
    const repOff = { ...rep, status: "DEACTIVATED" } as const;
    vi.mocked(usersApi.deactivateUser).mockResolvedValue(repOff);
    vi.mocked(usersApi.reactivateUser).mockResolvedValue(rep);
    const statusOfRep = () => usersInStore(store)?.find((user) => user.id === rep.id)?.status;
    const settled = () =>
      vi.waitFor(() => {
        expect(store.getState().users.status).toBe("succeeded");
      });

    serverListBecomes([admin, manager, repOff]);
    await store.dispatch(deactivateUser(rep.id));
    await settled();
    expect(statusOfRep()).toBe("DEACTIVATED");

    serverListBecomes([admin, manager, rep]);
    await store.dispatch(reactivateUser(rep.id));
    await settled();
    expect(statusOfRep()).toBe("ACTIVE");
  });

  it("a refused mutation rejects with the ApiError and changes nothing", async () => {
    const store = await loadedStore();
    const lastAdmin: ApiError = { code: "LAST_ADMIN", message: "Server text", details: null };
    vi.mocked(usersApi.deactivateUser).mockRejectedValue(lastAdmin);

    await expect(store.dispatch(deactivateUser(admin.id)).unwrap()).rejects.toEqual(lastAdmin);

    expect(store.getState().users).toEqual({ data: list, status: "succeeded", error: null });
  });

  it("resendInvite returns the link result without touching the list", async () => {
    const store = await loadedStore();
    vi.mocked(usersApi.resendInvite).mockResolvedValue({ emailed: true, link: null });

    const result = await store.dispatch(resendInvite(invited.id)).unwrap();

    expect(result).toEqual({ emailed: true, link: null });
    expect(store.getState().users.data).toEqual(list);
  });
});
