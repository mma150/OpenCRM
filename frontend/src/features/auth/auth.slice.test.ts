import { beforeEach, describe, expect, it, vi } from "vitest";

import { listUsers } from "@/features/users/users.api";
import { fetchUsers } from "@/features/users/users.slice";
import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";
import { adminUser, makeSignedInStore } from "@/test/render-with-store";

import * as authApi from "./auth.api";
import {
  acceptInvite,
  changePassword,
  fetchMe,
  login,
  logout,
  sessionExpired,
  setupAdmin,
  updateProfile,
} from "./auth.slice";
import type { Me } from "./auth.types";

vi.mock("./auth.api");
vi.mock("@/features/users/users.api");

const unauthenticated: ApiError = {
  code: "UNAUTHENTICATED",
  message: "Sign in to continue",
  details: null,
};

// A promise the test resolves by hand, so a request can stay "in flight".
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("auth slice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no user and no error", () => {
    expect(makeStore().getState().auth).toEqual({ data: null, status: "idle", error: null });
  });

  it("fetchMe goes loading, then succeeded with the user", async () => {
    const request = deferred<Me>();
    vi.mocked(authApi.getMe).mockReturnValue(request.promise);
    const store = makeStore();

    const pending = store.dispatch(fetchMe());
    expect(store.getState().auth.status).toBe("loading");

    request.resolve(adminUser);
    await pending;

    expect(store.getState().auth).toEqual({ data: adminUser, status: "succeeded", error: null });
  });

  it("fetchMe goes failed with UNAUTHENTICATED when nobody is signed in", async () => {
    vi.mocked(authApi.getMe).mockRejectedValue(unauthenticated);
    const store = makeStore();

    await store.dispatch(fetchMe());

    const { data, status, error } = store.getState().auth;
    expect(data).toBeNull();
    expect(status).toBe("failed");
    expect(error?.code).toBe("UNAUTHENTICATED");
  });

  it("fetchMe keeps any other failure as a real error", async () => {
    vi.mocked(authApi.getMe).mockRejectedValue({
      code: "NETWORK_ERROR",
      message: "Could not reach the server",
      details: null,
    });
    const store = makeStore();

    await store.dispatch(fetchMe());

    expect(store.getState().auth.error?.code).toBe("NETWORK_ERROR");
  });

  it("starts no second fetchMe while one is loading", async () => {
    const request = deferred<Me>();
    vi.mocked(authApi.getMe).mockReturnValue(request.promise);
    const store = makeStore();

    const first = store.dispatch(fetchMe());
    const second = store.dispatch(fetchMe());
    request.resolve(adminUser);
    await Promise.all([first, second]);

    expect(authApi.getMe).toHaveBeenCalledTimes(1);
  });

  const signedIn = { data: adminUser, status: "succeeded", error: null };

  it("login signs the user in", async () => {
    vi.mocked(authApi.login).mockResolvedValue(adminUser);
    const store = makeStore();

    await store.dispatch(login({ email: adminUser.email, password: "a-long-password" }));

    expect(store.getState().auth).toEqual(signedIn);
  });

  it("setupAdmin signs the new Admin in", async () => {
    vi.mocked(authApi.setupAdmin).mockResolvedValue(adminUser);
    const store = makeStore();

    await store.dispatch(
      setupAdmin({ name: "Ada", email: adminUser.email, password: "a-long-password" }),
    );

    expect(store.getState().auth).toEqual(signedIn);
  });

  it("acceptInvite signs the invited user in", async () => {
    vi.mocked(authApi.acceptInvite).mockResolvedValue(adminUser);
    const store = makeStore();

    await store.dispatch(acceptInvite({ token: "token", password: "a-long-password" }));

    expect(store.getState().auth).toEqual(signedIn);
  });

  it("a failed login rejects with the ApiError and leaves the state alone", async () => {
    const wrongPassword: ApiError = {
      code: "INVALID_CREDENTIALS",
      message: "Email or password is incorrect",
      details: null,
    };
    vi.mocked(authApi.login).mockRejectedValue(wrongPassword);
    const store = makeStore();

    const attempt = store.dispatch(login({ email: "a@example.com", password: "wrong" })).unwrap();

    await expect(attempt).rejects.toEqual(wrongPassword);
    expect(store.getState().auth).toEqual({ data: null, status: "idle", error: null });
  });

  it("updateProfile replaces the user with what the server returned", async () => {
    const renamed = { ...adminUser, name: "Ada Lovelace" };
    vi.mocked(authApi.updateMe).mockResolvedValue(renamed);
    const store = makeSignedInStore(adminUser);

    await store.dispatch(updateProfile({ name: "Ada Lovelace" }));

    expect(store.getState().auth.data).toEqual(renamed);
  });

  it("changePassword keeps the user signed in", async () => {
    vi.mocked(authApi.changePassword).mockResolvedValue();
    const store = makeSignedInStore(adminUser);

    await store
      .dispatch(
        changePassword({ currentPassword: "old-password-1", newPassword: "new-password-1" }),
      )
      .unwrap();

    expect(store.getState().auth.data).toEqual(adminUser);
  });

  it("logout signs out and resets every slice", async () => {
    vi.mocked(listUsers).mockResolvedValue({ users: [], mailEnabled: true });
    vi.mocked(authApi.logout).mockResolvedValue();
    const store = makeSignedInStore(adminUser);
    await store.dispatch(fetchUsers());
    expect(store.getState().users.status).toBe("succeeded");

    await store.dispatch(logout());

    expect(store.getState().users).toEqual({ data: null, status: "idle", error: null });
    expect(store.getState().health).toEqual({ data: null, status: "idle", error: null });
    const { data, status, error } = store.getState().auth;
    expect(data).toBeNull();
    expect(status).toBe("failed");
    expect(error?.code).toBe("UNAUTHENTICATED");
  });

  it("a session that expired resets every slice the same way", async () => {
    vi.mocked(listUsers).mockResolvedValue({ users: [], mailEnabled: true });
    const store = makeSignedInStore(adminUser);
    await store.dispatch(fetchUsers());

    store.dispatch(sessionExpired());

    expect(store.getState().users.data).toBeNull();
    expect(store.getState().auth.data).toBeNull();
    expect(store.getState().auth.error?.code).toBe("UNAUTHENTICATED");
  });

  it("a logout that fails leaves the user signed in", async () => {
    vi.mocked(authApi.logout).mockRejectedValue({
      code: "NETWORK_ERROR",
      message: "Could not reach the server",
      details: null,
    });
    const store = makeSignedInStore(adminUser);

    await store.dispatch(logout());

    expect(store.getState().auth.data).toEqual(adminUser);
  });
});
