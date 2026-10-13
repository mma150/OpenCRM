import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import * as emailSettingsApi from "./email-settings.api";
import { environmentSettings, noSettings, savedSettings } from "./email-settings.fixtures";
import {
  fetchEmailSettings,
  fetchEmailStatus,
  removeEmailSettings,
  saveEmailSettings,
} from "./email-settings.slice";
import type { EmailSettings, EmailStatus } from "./email-settings.types";

vi.mock("./email-settings.api");

const forbidden: ApiError = { code: "FORBIDDEN", message: "Server text", details: null };
const idle = { data: null, status: "idle", error: null };

// A promise the test resolves by hand, so a request can stay "in flight".
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("email settings slice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data and no error, for both parts", () => {
    expect(makeStore().getState().emailSettings).toEqual({ status: idle, settings: idle });
  });

  it("loads the status: loading, then succeeded", async () => {
    const request = deferred<EmailStatus>();
    vi.mocked(emailSettingsApi.getEmailStatus).mockReturnValue(request.promise);
    const store = makeStore();

    const pending = store.dispatch(fetchEmailStatus());
    expect(store.getState().emailSettings.status.status).toBe("loading");

    request.resolve({ enabled: false });
    await pending;
    expect(store.getState().emailSettings.status).toEqual({
      data: { enabled: false },
      status: "succeeded",
      error: null,
    });
    // The settings are another request, for Admins only.
    expect(store.getState().emailSettings.settings).toEqual(idle);
  });

  it("loads the settings: loading, then succeeded, and the status follows from the source", async () => {
    const request = deferred<EmailSettings>();
    vi.mocked(emailSettingsApi.getEmailSettings).mockReturnValue(request.promise);
    const store = makeStore();

    const pending = store.dispatch(fetchEmailSettings());
    expect(store.getState().emailSettings.settings.status).toBe("loading");

    request.resolve(environmentSettings);
    await pending;
    expect(store.getState().emailSettings.settings).toEqual({
      data: environmentSettings,
      status: "succeeded",
      error: null,
    });
    expect(store.getState().emailSettings.status.data).toEqual({ enabled: true });
  });

  it("goes failed and keeps the ApiError code and message, for each part", async () => {
    vi.mocked(emailSettingsApi.getEmailStatus).mockRejectedValue(forbidden);
    vi.mocked(emailSettingsApi.getEmailSettings).mockRejectedValue(forbidden);
    const store = makeStore();

    await store.dispatch(fetchEmailStatus());
    await store.dispatch(fetchEmailSettings());

    const failed = { data: null, status: "failed", error: forbidden };
    expect(store.getState().emailSettings).toEqual({ status: failed, settings: failed });
  });

  it("starts no second request while one is loading", async () => {
    const status = deferred<EmailStatus>();
    const settings = deferred<EmailSettings>();
    vi.mocked(emailSettingsApi.getEmailStatus).mockReturnValue(status.promise);
    vi.mocked(emailSettingsApi.getEmailSettings).mockReturnValue(settings.promise);
    const store = makeStore();

    const requests = [
      store.dispatch(fetchEmailStatus()),
      store.dispatch(fetchEmailStatus()),
      store.dispatch(fetchEmailSettings()),
      store.dispatch(fetchEmailSettings()),
    ];
    status.resolve({ enabled: true });
    settings.resolve(savedSettings);
    await Promise.all(requests);

    expect(emailSettingsApi.getEmailStatus).toHaveBeenCalledTimes(1);
    expect(emailSettingsApi.getEmailSettings).toHaveBeenCalledTimes(1);
  });

  it("takes the settings in effect from a save and from a removal", async () => {
    vi.mocked(emailSettingsApi.getEmailSettings).mockResolvedValue(noSettings);
    vi.mocked(emailSettingsApi.saveEmailSettings).mockResolvedValue(savedSettings);
    vi.mocked(emailSettingsApi.removeEmailSettings).mockResolvedValue(noSettings);
    const store = makeStore();
    await store.dispatch(fetchEmailSettings());
    expect(store.getState().emailSettings.status.data).toEqual({ enabled: false });

    const input = { host: "smtp.example.com", port: 587, secure: false, fromAddress: "a@b.co" };
    await store.dispatch(saveEmailSettings(input));
    expect(emailSettingsApi.saveEmailSettings).toHaveBeenCalledWith(input);
    expect(store.getState().emailSettings.settings.data).toEqual(savedSettings);
    expect(store.getState().emailSettings.status.data).toEqual({ enabled: true });

    await store.dispatch(removeEmailSettings());
    expect(store.getState().emailSettings.settings.data).toEqual(noSettings);
    expect(store.getState().emailSettings.status.data).toEqual({ enabled: false });
  });

  it("leaves the settings alone when a save is refused, and hands over the error", async () => {
    vi.mocked(emailSettingsApi.getEmailSettings).mockResolvedValue(savedSettings);
    vi.mocked(emailSettingsApi.saveEmailSettings).mockRejectedValue(forbidden);
    const store = makeStore();
    await store.dispatch(fetchEmailSettings());

    const result = await store.dispatch(
      saveEmailSettings({ host: "other", port: 25, secure: false, fromAddress: "a@b.co" }),
    );

    expect(result.payload).toEqual(forbidden);
    expect(store.getState().emailSettings.settings).toEqual({
      data: savedSettings,
      status: "succeeded",
      error: null,
    });
  });
});
