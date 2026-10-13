import { beforeEach, describe, expect, it, vi } from "vitest";

import { sent as sentInvoice } from "@/features/invoices/invoices.fixtures";
import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import * as quotesApi from "./quotes.api";
import { accepted, defaultQuery, draft, quoteList, sent } from "./quotes.fixtures";
import {
  changeQuoteStatus,
  createQuote,
  createQuoteInvoice,
  deleteQuote,
  duplicateQuote,
  fetchQuote,
  fetchQuotes,
  sendQuote,
  updateQuote,
} from "./quotes.slice";
import type { Quote, QuoteList } from "./quotes.types";

vi.mock("./quotes.api");

const list = quoteList();
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

// A store with the list and one quote loaded.
async function loadedStore(current: Quote = draft) {
  vi.mocked(quotesApi.listQuotes).mockResolvedValue(list);
  vi.mocked(quotesApi.getQuote).mockResolvedValue(current);
  const store = makeStore();
  await store.dispatch(fetchQuotes(defaultQuery));
  await store.dispatch(fetchQuote(current.id));
  // From here on a reload stays in flight, so a test sees what a change itself did.
  vi.mocked(quotesApi.listQuotes).mockReset();
  vi.mocked(quotesApi.listQuotes).mockReturnValue(new Promise(() => undefined));
  return store;
}

const inList = (store: ReturnType<typeof makeStore>, id: string) =>
  store.getState().quotes.list.data?.quotes.find((quote) => quote.id === id);

describe("quotes slice: the list", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data", () => {
    expect(makeStore().getState().quotes).toEqual({
      list: { data: null, status: "idle", error: null, query: null },
      current: { data: null, status: "idle", error: null, id: null },
    });
  });

  it("goes loading, then succeeded with the page and the query it was asked for", async () => {
    const request = deferred<QuoteList>();
    vi.mocked(quotesApi.listQuotes).mockReturnValue(request.promise);
    const store = makeStore();

    const pending = store.dispatch(fetchQuotes(defaultQuery));
    expect(store.getState().quotes.list).toMatchObject({ status: "loading", query: defaultQuery });

    request.resolve(list);
    await pending;
    expect(store.getState().quotes.list).toEqual({
      data: list,
      status: "succeeded",
      error: null,
      query: defaultQuery,
    });
  });

  it("goes failed and keeps the ApiError, and the last page", async () => {
    const store = await loadedStore();
    vi.mocked(quotesApi.listQuotes).mockRejectedValue(forbidden);

    await store.dispatch(fetchQuotes({ ...defaultQuery, page: 2 }));

    expect(store.getState().quotes.list).toMatchObject({
      data: list,
      status: "failed",
      error: forbidden,
    });
  });

  it("skips a second request for the same query while one is loading", async () => {
    vi.mocked(quotesApi.listQuotes).mockReturnValue(new Promise(() => undefined));
    const store = makeStore();

    void store.dispatch(fetchQuotes(defaultQuery));
    await store.dispatch(fetchQuotes({ ...defaultQuery }));

    expect(quotesApi.listQuotes).toHaveBeenCalledTimes(1);
  });

  it("lets a different query through and ignores the older answer", async () => {
    const slow = deferred<QuoteList>();
    const newer = quoteList([sent]);
    vi.mocked(quotesApi.listQuotes).mockReturnValueOnce(slow.promise).mockResolvedValueOnce(newer);
    const store = makeStore();

    const first = store.dispatch(fetchQuotes(defaultQuery));
    await store.dispatch(fetchQuotes({ ...defaultQuery, status: "SENT" }));
    slow.resolve(list);
    await first;

    expect(store.getState().quotes.list.data).toEqual(newer);
    expect(store.getState().quotes.list.status).toBe("succeeded");
  });

  it("ignores the failure of an older query as well", async () => {
    const slow = deferred<QuoteList>();
    vi.mocked(quotesApi.listQuotes).mockReturnValueOnce(slow.promise).mockResolvedValueOnce(list);
    const store = makeStore();

    const first = store.dispatch(fetchQuotes(defaultQuery));
    await store.dispatch(fetchQuotes({ ...defaultQuery, search: "fleet" }));
    slow.reject(forbidden);
    await first;

    expect(store.getState().quotes.list).toMatchObject({ status: "succeeded", error: null });
  });
});

describe("quotes slice: the current quote", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads one quote by id, and keeps the error when that fails", async () => {
    vi.mocked(quotesApi.getQuote).mockResolvedValueOnce(draft).mockRejectedValueOnce(forbidden);
    const store = makeStore();

    await store.dispatch(fetchQuote(draft.id));
    expect(store.getState().quotes.current).toEqual({
      data: draft,
      status: "succeeded",
      error: null,
      id: draft.id,
    });

    await store.dispatch(fetchQuote(draft.id));
    // A failed reload keeps the quote that is on screen.
    expect(store.getState().quotes.current).toMatchObject({
      data: draft,
      status: "failed",
      error: forbidden,
    });
  });

  it("never shows one quote under another quote's address", async () => {
    const store = await loadedStore(draft);
    vi.mocked(quotesApi.getQuote).mockReturnValue(new Promise(() => undefined));

    void store.dispatch(fetchQuote(sent.id));

    expect(store.getState().quotes.current).toMatchObject({
      data: null,
      status: "loading",
      id: sent.id,
    });
  });

  it("skips a second request for the same id while one is loading, and drops a stale answer", async () => {
    const slow = deferred<Quote>();
    vi.mocked(quotesApi.getQuote).mockReturnValueOnce(slow.promise).mockResolvedValueOnce(sent);
    const store = makeStore();

    const first = store.dispatch(fetchQuote(draft.id));
    await store.dispatch(fetchQuote(draft.id));
    expect(quotesApi.getQuote).toHaveBeenCalledTimes(1);

    await store.dispatch(fetchQuote(sent.id));
    slow.resolve(draft);
    await first;
    expect(store.getState().quotes.current.data).toEqual(sent);
  });
});

describe("quotes slice: changes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("makes a new quote the current one and reloads the list", async () => {
    const store = await loadedStore();
    const made = { ...draft, id: "new-quote", number: "Q-0008" };
    vi.mocked(quotesApi.createQuote).mockResolvedValue(made);

    await store.dispatch(createQuote({ opportunityId: draft.opportunity.id })).unwrap();

    expect(quotesApi.createQuote).toHaveBeenCalledWith({ opportunityId: draft.opportunity.id });
    expect(store.getState().quotes.current).toMatchObject({
      data: made,
      id: "new-quote",
      status: "succeeded",
    });
    expect(quotesApi.listQuotes).toHaveBeenCalledWith(defaultQuery);
  });

  it("does the same for a duplicate", async () => {
    const store = await loadedStore(sent);
    const copy = { ...draft, id: "copy", number: "Q-0009" };
    vi.mocked(quotesApi.duplicateQuote).mockResolvedValue(copy);

    await store.dispatch(duplicateQuote(sent.id)).unwrap();

    expect(quotesApi.duplicateQuote).toHaveBeenCalledWith(sent.id);
    expect(store.getState().quotes.current).toMatchObject({ data: copy, id: "copy" });
    // The quote it was copied from is untouched.
    expect(inList(store, sent.id)).toEqual(sent);
  });

  it("puts an updated quote into the current quote and the list", async () => {
    const store = await loadedStore();
    const saved = { ...draft, notes: "Changed.", total: 99 };
    vi.mocked(quotesApi.updateQuote).mockResolvedValue(saved);

    await store.dispatch(updateQuote({ id: draft.id, changes: { notes: "Changed." } })).unwrap();

    expect(quotesApi.updateQuote).toHaveBeenCalledWith(draft.id, { notes: "Changed." });
    expect(store.getState().quotes.current.data).toEqual(saved);
    expect(inList(store, draft.id)).toEqual(saved);
    expect(quotesApi.listQuotes).toHaveBeenCalledWith(defaultQuery);
  });

  it("marks a quote as sent, with and without an email", async () => {
    const store = await loadedStore();
    vi.mocked(quotesApi.sendQuote).mockResolvedValue({ ...draft, status: "SENT" });
    const email = { to: ["m.chen@northwind.example"], subject: "Quote", body: "Hello" };

    await store.dispatch(sendQuote({ id: draft.id })).unwrap();
    expect(quotesApi.sendQuote).toHaveBeenLastCalledWith(draft.id, undefined);
    expect(store.getState().quotes.current.data?.status).toBe("SENT");
    expect(inList(store, draft.id)?.status).toBe("SENT");

    await store.dispatch(sendQuote({ id: draft.id, email })).unwrap();
    expect(quotesApi.sendQuote).toHaveBeenLastCalledWith(draft.id, email);
  });

  it.each([
    ["accept", "ACCEPTED"],
    ["decline", "DECLINED"],
    ["reopen", "DRAFT"],
  ] as const)("puts the answer of %s into the store", async (action, status) => {
    const store = await loadedStore(sent);
    vi.mocked(quotesApi.changeQuoteStatus).mockResolvedValue({ ...sent, status });

    await store.dispatch(changeQuoteStatus({ id: sent.id, action })).unwrap();

    expect(quotesApi.changeQuoteStatus).toHaveBeenCalledWith(sent.id, action);
    expect(store.getState().quotes.current.data?.status).toBe(status);
    expect(inList(store, sent.id)?.status).toBe(status);
  });

  it("names the new invoice on the quote it was made from", async () => {
    const store = await loadedStore(accepted);
    const invoice = { ...sentInvoice, quote: { id: accepted.id, number: accepted.number } };
    vi.mocked(quotesApi.createInvoice).mockResolvedValue(invoice);

    const made = await store.dispatch(createQuoteInvoice({ id: accepted.id })).unwrap();

    expect(quotesApi.createInvoice).toHaveBeenCalledWith(accepted.id, undefined);
    expect(made).toEqual(invoice);
    const named = { id: invoice.id, number: invoice.number };
    expect(store.getState().quotes.current.data?.invoice).toEqual(named);
    expect(inList(store, accepted.id)?.invoice).toEqual(named);
  });

  it("takes a deleted quote out of the list and out of current", async () => {
    const store = await loadedStore();
    vi.mocked(quotesApi.deleteQuote).mockResolvedValue();

    await store.dispatch(deleteQuote(draft.id)).unwrap();

    expect(inList(store, draft.id)).toBeUndefined();
    expect(store.getState().quotes.current).toEqual({
      data: null,
      status: "idle",
      error: null,
      id: null,
    });
  });

  it("leaves the store as it was when a change is refused, and hands over the ApiError", async () => {
    const store = await loadedStore();
    const before = store.getState().quotes;
    const refused: ApiError = { code: "QUOTE_NOT_EDITABLE", message: "No", details: null };
    vi.mocked(quotesApi.updateQuote).mockRejectedValue(refused);

    await expect(
      store.dispatch(updateQuote({ id: draft.id, changes: { notes: null } })).unwrap(),
    ).rejects.toEqual(refused);

    expect(store.getState().quotes).toEqual(before);
    expect(quotesApi.listQuotes).not.toHaveBeenCalled();
  });
});
