import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import * as api from "./email-templates.api";
import { checkIn, followUp, placeholders, templates, thanks } from "./email-templates.fixtures";
import {
  createEmailTemplate,
  deleteEmailTemplate,
  fetchEmailPlaceholders,
  fetchEmailTemplates,
  updateEmailTemplate,
} from "./email-templates.slice";
import type { EmailTemplate } from "./email-templates.types";

vi.mock("./email-templates.api");

const forbidden: ApiError = { code: "FORBIDDEN", message: "Server text", details: null };

// A promise the test resolves by hand, so a request can stay "in flight".
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function loadedStore() {
  vi.mocked(api.listEmailTemplates).mockResolvedValue(templates);
  const store = makeStore();
  await store.dispatch(fetchEmailTemplates());
  return store;
}

const names = (store: ReturnType<typeof makeStore>) =>
  store.getState().emailTemplates.list.data?.map((template) => template.name);

describe("email templates slice: the list", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data and no error", () => {
    expect(makeStore().getState().emailTemplates).toEqual({
      list: { data: null, status: "idle", error: null },
      placeholders: { data: null, status: "idle", error: null },
    });
  });

  it("goes from loading to succeeded with the templates", async () => {
    const request = deferred<EmailTemplate[]>();
    vi.mocked(api.listEmailTemplates).mockReturnValue(request.promise);
    const store = makeStore();
    const pending = store.dispatch(fetchEmailTemplates());
    expect(store.getState().emailTemplates.list.status).toBe("loading");

    request.resolve(templates);
    await pending;
    expect(store.getState().emailTemplates.list).toEqual({
      data: templates,
      status: "succeeded",
      error: null,
    });
  });

  it("keeps the ApiError when loading fails, and the last list on a failed reload", async () => {
    const store = await loadedStore();
    vi.mocked(api.listEmailTemplates).mockRejectedValue(forbidden);
    await store.dispatch(fetchEmailTemplates());

    const { list } = store.getState().emailTemplates;
    expect(list.status).toBe("failed");
    expect(list.error).toEqual(forbidden);
    expect(list.data).toEqual(templates);
  });

  it("does not start a second request while one is loading", async () => {
    const request = deferred<EmailTemplate[]>();
    vi.mocked(api.listEmailTemplates).mockReturnValue(request.promise);
    const store = makeStore();
    const first = store.dispatch(fetchEmailTemplates());
    const second = store.dispatch(fetchEmailTemplates());
    request.resolve(templates);
    await Promise.all([first, second]);

    expect(api.listEmailTemplates).toHaveBeenCalledTimes(1);
  });
});

describe("email templates slice: the placeholders", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads them once: not while a request runs, and not again afterwards", async () => {
    vi.mocked(api.listEmailPlaceholders).mockResolvedValue(placeholders);
    const store = makeStore();
    await Promise.all([
      store.dispatch(fetchEmailPlaceholders()),
      store.dispatch(fetchEmailPlaceholders()),
    ]);
    await store.dispatch(fetchEmailPlaceholders());

    expect(api.listEmailPlaceholders).toHaveBeenCalledTimes(1);
    expect(store.getState().emailTemplates.placeholders).toEqual({
      data: placeholders,
      status: "succeeded",
      error: null,
    });
  });

  it("keeps the ApiError when loading fails, and asks again the next time", async () => {
    vi.mocked(api.listEmailPlaceholders).mockRejectedValueOnce(forbidden);
    const store = makeStore();
    await store.dispatch(fetchEmailPlaceholders());
    expect(store.getState().emailTemplates.placeholders).toEqual({
      data: null,
      status: "failed",
      error: forbidden,
    });

    vi.mocked(api.listEmailPlaceholders).mockResolvedValue(placeholders);
    await store.dispatch(fetchEmailPlaceholders());
    expect(store.getState().emailTemplates.placeholders.data).toEqual(placeholders);
  });
});

describe("email templates slice: mutations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("puts a new template where its name belongs, whatever the case", async () => {
    const store = await loadedStore();
    const created = { ...checkIn, id: "new", name: "demo invitation" };
    vi.mocked(api.createEmailTemplate).mockResolvedValue(created);

    const answer = await store
      .dispatch(createEmailTemplate({ name: "demo invitation", subject: "s", body: "b" }))
      .unwrap();

    expect(answer).toEqual(created);
    expect(names(store)).toEqual([
      "Checking in",
      "demo invitation",
      "Follow-up after demo",
      "Thanks for the call",
    ]);
  });

  it("replaces a changed template and moves it when it was renamed", async () => {
    const store = await loadedStore();
    vi.mocked(api.updateEmailTemplate).mockResolvedValue({ ...checkIn, name: "Zero pressure" });

    await store.dispatch(
      updateEmailTemplate({ id: checkIn.id, changes: { name: "Zero pressure" } }),
    );

    expect(api.updateEmailTemplate).toHaveBeenCalledWith(checkIn.id, { name: "Zero pressure" });
    expect(names(store)).toEqual(["Follow-up after demo", "Thanks for the call", "Zero pressure"]);
  });

  it("removes a deleted template", async () => {
    const store = await loadedStore();
    vi.mocked(api.deleteEmailTemplate).mockResolvedValue();

    await store.dispatch(deleteEmailTemplate(thanks.id));

    expect(store.getState().emailTemplates.list.data).toEqual([checkIn, followUp]);
  });

  it("leaves the list, its status and its error alone when a mutation is refused", async () => {
    const store = await loadedStore();
    vi.mocked(api.deleteEmailTemplate).mockRejectedValue(forbidden);

    await expect(store.dispatch(deleteEmailTemplate(followUp.id)).unwrap()).rejects.toEqual(
      forbidden,
    );

    expect(store.getState().emailTemplates.list).toEqual({
      data: templates,
      status: "succeeded",
      error: null,
    });
  });
});
