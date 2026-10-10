import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import * as contactsApi from "./contacts.api";
import { contactList, defaultQuery, elena, liam, marcus } from "./contacts.fixtures";
import {
  assignContact,
  createContact,
  deleteContact,
  fetchContact,
  fetchContacts,
  updateContact,
} from "./contacts.slice";
import type { Contact, ContactList, ContactListQuery } from "./contacts.types";

vi.mock("./contacts.api");

const list = contactList([marcus, liam, elena]);
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
  vi.mocked(contactsApi.listContacts).mockResolvedValue(list);
  const store = makeStore();
  await store.dispatch(fetchContacts(defaultQuery));
  vi.mocked(contactsApi.listContacts).mockClear();
  return store;
}

describe("contacts slice: the list", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data, no error and no query, for the list and the current contact", () => {
    expect(makeStore().getState().contacts).toEqual({
      list: { data: null, status: "idle", error: null, query: null },
      current: { data: null, status: "idle", error: null, id: null },
    });
  });

  it("goes loading with the query, then succeeded with the contacts and the meta", async () => {
    const request = deferred<ContactList>();
    vi.mocked(contactsApi.listContacts).mockReturnValue(request.promise);
    const store = makeStore();
    const query: ContactListQuery = { ...defaultQuery, search: "chen", page: 2 };

    const pending = store.dispatch(fetchContacts(query));
    expect(store.getState().contacts.list).toMatchObject({ status: "loading", query });
    expect(contactsApi.listContacts).toHaveBeenCalledWith(query);

    request.resolve(contactList([liam], { page: 2, total: 26 }));
    await pending;

    expect(store.getState().contacts.list).toEqual({
      data: { contacts: [liam], page: 2, pageSize: 25, total: 26 },
      status: "succeeded",
      error: null,
      query,
    });
  });

  it("goes failed and keeps the ApiError code and message", async () => {
    vi.mocked(contactsApi.listContacts).mockRejectedValue(forbidden);
    const store = makeStore();

    await store.dispatch(fetchContacts(defaultQuery));

    expect(store.getState().contacts.list).toMatchObject({
      data: null,
      status: "failed",
      error: forbidden,
    });
  });

  it("keeps the last page while a reload is running, and when it fails", async () => {
    const store = await loadedStore();
    const request = deferred<ContactList>();
    vi.mocked(contactsApi.listContacts).mockReturnValue(request.promise);

    const pending = store.dispatch(fetchContacts({ ...defaultQuery, page: 2 }));
    expect(store.getState().contacts.list).toMatchObject({ data: list, status: "loading" });

    request.reject(forbidden);
    await pending;
    expect(store.getState().contacts.list).toMatchObject({ data: list, status: "failed" });
  });

  it("starts no second request while the same query is loading", async () => {
    const request = deferred<ContactList>();
    vi.mocked(contactsApi.listContacts).mockReturnValue(request.promise);
    const store = makeStore();

    const first = store.dispatch(fetchContacts(defaultQuery));
    const second = store.dispatch(fetchContacts({ ...defaultQuery }));
    request.resolve(list);
    await Promise.all([first, second]);

    expect(contactsApi.listContacts).toHaveBeenCalledTimes(1);
  });

  it("lets a different query through while loading, and drops the older answer", async () => {
    const slow = deferred<ContactList>();
    const fast = deferred<ContactList>();
    vi.mocked(contactsApi.listContacts)
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);
    const store = makeStore();
    const newer: ContactListQuery = { ...defaultQuery, search: "liam" };

    const first = store.dispatch(fetchContacts(defaultQuery));
    const second = store.dispatch(fetchContacts(newer));
    expect(contactsApi.listContacts).toHaveBeenCalledTimes(2);

    fast.resolve(contactList([liam]));
    await second;
    // The answer to the first, older query arrives last and must not replace the newer one.
    slow.resolve(list);
    await first;

    expect(store.getState().contacts.list).toMatchObject({
      data: contactList([liam]),
      status: "succeeded",
      query: newer,
    });
  });
});

describe("contacts slice: the current contact", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("goes loading with the id, then succeeded with the contact", async () => {
    const request = deferred<Contact>();
    vi.mocked(contactsApi.getContact).mockReturnValue(request.promise);
    const store = makeStore();

    const pending = store.dispatch(fetchContact(marcus.id));
    expect(store.getState().contacts.current).toMatchObject({ status: "loading", id: marcus.id });

    request.resolve(marcus);
    await pending;

    expect(store.getState().contacts.current).toEqual({
      data: marcus,
      status: "succeeded",
      error: null,
      id: marcus.id,
    });
  });

  it("goes failed with NOT_FOUND for a contact that is missing or not visible", async () => {
    const notFound: ApiError = { code: "NOT_FOUND", message: "Contact not found", details: null };
    vi.mocked(contactsApi.getContact).mockRejectedValue(notFound);
    const store = makeStore();

    await store.dispatch(fetchContact(marcus.id));

    expect(store.getState().contacts.current).toMatchObject({
      data: null,
      status: "failed",
      error: notFound,
    });
  });

  it("starts no second request while the same contact is loading", async () => {
    const request = deferred<Contact>();
    vi.mocked(contactsApi.getContact).mockReturnValue(request.promise);
    const store = makeStore();

    const first = store.dispatch(fetchContact(marcus.id));
    const second = store.dispatch(fetchContact(marcus.id));
    request.resolve(marcus);
    await Promise.all([first, second]);

    expect(contactsApi.getContact).toHaveBeenCalledTimes(1);
  });

  it("keeps the contact while it is reloaded, but never shows it for another id", async () => {
    vi.mocked(contactsApi.getContact).mockResolvedValue(marcus);
    const store = makeStore();
    await store.dispatch(fetchContact(marcus.id));

    const request = deferred<Contact>();
    vi.mocked(contactsApi.getContact).mockReturnValue(request.promise);
    const reload = store.dispatch(fetchContact(marcus.id));
    expect(store.getState().contacts.current.data).toEqual(marcus);
    request.resolve(marcus);
    await reload;

    const other = deferred<Contact>();
    vi.mocked(contactsApi.getContact).mockReturnValue(other.promise);
    const next = store.dispatch(fetchContact(liam.id));
    expect(store.getState().contacts.current).toMatchObject({ data: null, id: liam.id });
    other.resolve(liam);
    await next;
    expect(store.getState().contacts.current.data).toEqual(liam);
  });
});

describe("contacts slice: mutations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const contactsInStore = (store: ReturnType<typeof makeStore>) =>
    store.getState().contacts.list.data?.contacts;

  it("createContact returns the new contact and reloads the list with its last query", async () => {
    const store = await loadedStore();
    const created = { ...liam, id: "new-contact" };
    vi.mocked(contactsApi.createContact).mockResolvedValue(created);
    vi.mocked(contactsApi.listContacts).mockResolvedValue(
      contactList([created, marcus, liam, elena]),
    );
    const input = { firstName: "Liam", lastName: "Gallagher" };

    const result = await store.dispatch(createContact(input)).unwrap();

    expect(result).toEqual(created);
    expect(contactsApi.createContact).toHaveBeenCalledWith(input);
    expect(contactsApi.listContacts).toHaveBeenCalledWith(defaultQuery);
    await vi.waitFor(() => {
      expect(contactsInStore(store)).toEqual([created, marcus, liam, elena]);
    });
  });

  it("does not load a list that was never opened", async () => {
    vi.mocked(contactsApi.createContact).mockResolvedValue(liam);
    const store = makeStore();

    await store.dispatch(createContact({ firstName: "Liam", lastName: "G" }));

    expect(contactsApi.listContacts).not.toHaveBeenCalled();
  });

  it("updateContact shows the returned contact at once, in the list and as the current contact", async () => {
    const store = await loadedStore();
    vi.mocked(contactsApi.getContact).mockResolvedValue(marcus);
    await store.dispatch(fetchContact(marcus.id));
    const changed: Contact = { ...marcus, jobTitle: "COO" };
    vi.mocked(contactsApi.updateContact).mockResolvedValue(changed);
    // The reload stays in flight, so what is checked is the immediate update.
    vi.mocked(contactsApi.listContacts).mockReturnValue(deferred<ContactList>().promise);

    await store.dispatch(updateContact({ id: marcus.id, changes: { jobTitle: "COO" } })).unwrap();

    expect(contactsApi.updateContact).toHaveBeenCalledWith(marcus.id, { jobTitle: "COO" });
    expect(contactsInStore(store)).toEqual([changed, liam, elena]);
    expect(store.getState().contacts.current.data).toEqual(changed);
    expect(contactsApi.listContacts).toHaveBeenCalledTimes(1);
  });

  it("does not touch the current contact when another contact changes", async () => {
    const store = await loadedStore();
    vi.mocked(contactsApi.getContact).mockResolvedValue(liam);
    await store.dispatch(fetchContact(liam.id));
    vi.mocked(contactsApi.updateContact).mockResolvedValue({ ...marcus, jobTitle: "COO" });
    vi.mocked(contactsApi.listContacts).mockResolvedValue(list);

    await store.dispatch(updateContact({ id: marcus.id, changes: { jobTitle: "COO" } }));

    expect(store.getState().contacts.current.data).toEqual(liam);
  });

  it("assignContact sends the new owner and stores the reassigned contact", async () => {
    const store = await loadedStore();
    const reassigned: Contact = { ...marcus, owner: { id: "owner-2", name: "Mia Manager" } };
    vi.mocked(contactsApi.assignContact).mockResolvedValue(reassigned);
    vi.mocked(contactsApi.listContacts).mockReturnValue(deferred<ContactList>().promise);

    await store.dispatch(assignContact({ id: marcus.id, ownerId: "owner-2" })).unwrap();

    expect(contactsApi.assignContact).toHaveBeenCalledWith(marcus.id, "owner-2");
    expect(contactsInStore(store)?.[0]?.owner.name).toBe("Mia Manager");
  });

  it("deleteContact removes the contact from the list and clears it as the current contact", async () => {
    const store = await loadedStore();
    vi.mocked(contactsApi.getContact).mockResolvedValue(marcus);
    await store.dispatch(fetchContact(marcus.id));
    vi.mocked(contactsApi.deleteContact).mockResolvedValue();
    vi.mocked(contactsApi.listContacts).mockReturnValue(deferred<ContactList>().promise);

    await store.dispatch(deleteContact(marcus.id)).unwrap();

    expect(contactsApi.deleteContact).toHaveBeenCalledWith(marcus.id);
    expect(contactsInStore(store)).toEqual([liam, elena]);
    expect(store.getState().contacts.current).toEqual({
      data: null,
      status: "idle",
      error: null,
      id: null,
    });
    expect(contactsApi.listContacts).toHaveBeenCalledWith(defaultQuery);
  });

  it("a refused mutation rejects with the ApiError and changes nothing", async () => {
    const store = await loadedStore();
    const before = store.getState().contacts;
    vi.mocked(contactsApi.assignContact).mockRejectedValue(forbidden);
    vi.mocked(contactsApi.deleteContact).mockRejectedValue(forbidden);

    await expect(
      store.dispatch(assignContact({ id: marcus.id, ownerId: "owner-2" })).unwrap(),
    ).rejects.toEqual(forbidden);
    await expect(store.dispatch(deleteContact(marcus.id)).unwrap()).rejects.toEqual(forbidden);

    expect(store.getState().contacts).toEqual(before);
    expect(contactsApi.listContacts).not.toHaveBeenCalled();
  });
});
