import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import * as invoicesApi from "./invoices.api";
import {
  defaultQuery,
  draft,
  emptySummary,
  invoiceList,
  paid,
  sent,
  summary,
} from "./invoices.fixtures";
import {
  changeInvoiceStatus,
  fetchInvoice,
  fetchInvoices,
  fetchInvoiceSummary,
  updateInvoice,
} from "./invoices.slice";
import type { Invoice, InvoiceList, InvoiceSummary } from "./invoices.types";

vi.mock("./invoices.api");

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

// A store with the list, the summary and one invoice loaded.
async function loadedStore(current: Invoice = sent) {
  vi.mocked(invoicesApi.listInvoices).mockResolvedValue(invoiceList());
  vi.mocked(invoicesApi.getInvoiceSummary).mockResolvedValue(summary);
  vi.mocked(invoicesApi.getInvoice).mockResolvedValue(current);
  const store = makeStore();
  await store.dispatch(fetchInvoices(defaultQuery));
  await store.dispatch(fetchInvoiceSummary());
  await store.dispatch(fetchInvoice(current.id));
  // From here on a reload stays in flight, so a test sees what a change itself did.
  vi.mocked(invoicesApi.listInvoices).mockReset();
  vi.mocked(invoicesApi.getInvoiceSummary).mockReset();
  vi.mocked(invoicesApi.listInvoices).mockReturnValue(new Promise(() => undefined));
  vi.mocked(invoicesApi.getInvoiceSummary).mockReturnValue(new Promise(() => undefined));
  return store;
}

describe("invoices slice: the list", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data, for the list, the summary and the current invoice", () => {
    expect(makeStore().getState().invoices).toEqual({
      list: { data: null, status: "idle", error: null, query: null },
      summary: { data: null, status: "idle", error: null },
      current: { data: null, status: "idle", error: null, id: null },
    });
  });

  it("goes loading with the query, then succeeded with the invoices and the meta", async () => {
    const request = deferred<InvoiceList>();
    vi.mocked(invoicesApi.listInvoices).mockReturnValue(request.promise);
    const store = makeStore();
    const query = { ...defaultQuery, status: "OVERDUE" as const, page: 2 };

    const pending = store.dispatch(fetchInvoices(query));
    expect(store.getState().invoices.list).toMatchObject({ status: "loading", query });
    expect(invoicesApi.listInvoices).toHaveBeenCalledWith(query);

    request.resolve(invoiceList([draft], { page: 2, total: 26 }));
    await pending;

    expect(store.getState().invoices.list).toEqual({
      data: { invoices: [draft], page: 2, pageSize: 25, total: 26 },
      status: "succeeded",
      error: null,
      query,
    });
  });

  it("goes failed and keeps the ApiError code and message", async () => {
    vi.mocked(invoicesApi.listInvoices).mockRejectedValue(forbidden);
    const store = makeStore();

    await store.dispatch(fetchInvoices(defaultQuery));

    expect(store.getState().invoices.list).toMatchObject({
      data: null,
      status: "failed",
      error: forbidden,
    });
  });

  it("starts no second request while the same query is loading", async () => {
    const request = deferred<InvoiceList>();
    vi.mocked(invoicesApi.listInvoices).mockReturnValue(request.promise);
    const store = makeStore();

    const first = store.dispatch(fetchInvoices(defaultQuery));
    await store.dispatch(fetchInvoices({ ...defaultQuery }));
    expect(invoicesApi.listInvoices).toHaveBeenCalledTimes(1);

    request.resolve(invoiceList());
    await first;
  });

  it("lets a different query through and ignores the older answer", async () => {
    const slow = deferred<InvoiceList>();
    const fast = deferred<InvoiceList>();
    vi.mocked(invoicesApi.listInvoices)
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);
    const store = makeStore();
    const newer = { ...defaultQuery, search: "kestrel" };

    const first = store.dispatch(fetchInvoices(defaultQuery));
    const second = store.dispatch(fetchInvoices(newer));
    fast.resolve(invoiceList([paid]));
    await second;
    slow.resolve(invoiceList([draft, sent]));
    await first;

    expect(store.getState().invoices.list).toMatchObject({
      status: "succeeded",
      query: newer,
      data: { invoices: [paid] },
    });

    // A slow failure of an older query is dropped the same way.
    const failing = deferred<InvoiceList>();
    vi.mocked(invoicesApi.listInvoices)
      .mockReturnValueOnce(failing.promise)
      .mockResolvedValueOnce(invoiceList([sent]));
    const third = store.dispatch(fetchInvoices(defaultQuery));
    await store.dispatch(fetchInvoices(newer));
    failing.reject(forbidden);
    await third;
    expect(store.getState().invoices.list).toMatchObject({ status: "succeeded", error: null });
  });
});

describe("invoices slice: the summary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("goes loading, then succeeded with the totals, and keeps them while it reloads", async () => {
    const request = deferred<InvoiceSummary>();
    vi.mocked(invoicesApi.getInvoiceSummary)
      .mockResolvedValueOnce(summary)
      .mockReturnValueOnce(request.promise);
    const store = makeStore();

    await store.dispatch(fetchInvoiceSummary());
    expect(store.getState().invoices.summary).toEqual({
      data: summary,
      status: "succeeded",
      error: null,
    });

    const reload = store.dispatch(fetchInvoiceSummary());
    expect(store.getState().invoices.summary).toMatchObject({ data: summary, status: "loading" });
    // No second request while one is loading.
    await store.dispatch(fetchInvoiceSummary());
    expect(invoicesApi.getInvoiceSummary).toHaveBeenCalledTimes(2);

    request.resolve(emptySummary);
    await reload;
    expect(store.getState().invoices.summary.data).toEqual(emptySummary);
  });

  it("goes failed with the ApiError", async () => {
    vi.mocked(invoicesApi.getInvoiceSummary).mockRejectedValue(forbidden);
    const store = makeStore();

    await store.dispatch(fetchInvoiceSummary());

    expect(store.getState().invoices.summary).toEqual({
      data: null,
      status: "failed",
      error: forbidden,
    });
  });
});

describe("invoices slice: the current invoice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads one invoice by id, and never shows it under another id", async () => {
    const request = deferred<Invoice>();
    vi.mocked(invoicesApi.getInvoice)
      .mockResolvedValueOnce(sent)
      .mockReturnValueOnce(request.promise);
    const store = makeStore();

    await store.dispatch(fetchInvoice(sent.id));
    expect(store.getState().invoices.current).toEqual({
      data: sent,
      status: "succeeded",
      error: null,
      id: sent.id,
    });

    const next = store.dispatch(fetchInvoice(paid.id));
    expect(store.getState().invoices.current).toMatchObject({
      data: null,
      status: "loading",
      id: paid.id,
    });
    // The same id is not asked for twice while it loads.
    await store.dispatch(fetchInvoice(paid.id));
    expect(invoicesApi.getInvoice).toHaveBeenCalledTimes(2);
    request.resolve(paid);
    await next;
    expect(store.getState().invoices.current.data).toEqual(paid);
  });

  it("keeps the invoice on screen while the same one is loaded again", async () => {
    const request = deferred<Invoice>();
    vi.mocked(invoicesApi.getInvoice)
      .mockResolvedValueOnce(sent)
      .mockReturnValueOnce(request.promise);
    const store = makeStore();
    await store.dispatch(fetchInvoice(sent.id));

    const reload = store.dispatch(fetchInvoice(sent.id));
    expect(store.getState().invoices.current).toMatchObject({ data: sent, status: "loading" });
    request.resolve({ ...sent, status: "PAID" });
    await reload;
    expect(store.getState().invoices.current.data?.status).toBe("PAID");
  });

  it("goes failed with the ApiError", async () => {
    const notFound: ApiError = { code: "NOT_FOUND", message: "No invoice", details: null };
    vi.mocked(invoicesApi.getInvoice).mockRejectedValue(notFound);
    const store = makeStore();

    await store.dispatch(fetchInvoice(sent.id));

    expect(store.getState().invoices.current).toMatchObject({
      data: null,
      status: "failed",
      error: notFound,
    });
  });
});

describe("invoices slice: changes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("puts an edited invoice in the list and in current, and reloads the list and the summary", async () => {
    const store = await loadedStore();
    const edited = { ...sent, dueDate: "2099-12-01", notes: null };
    vi.mocked(invoicesApi.updateInvoice).mockResolvedValue(edited);

    await store
      .dispatch(updateInvoice({ id: sent.id, changes: { dueDate: "2099-12-01", notes: null } }))
      .unwrap();

    expect(invoicesApi.updateInvoice).toHaveBeenCalledWith(sent.id, {
      dueDate: "2099-12-01",
      notes: null,
    });
    const { list, current, summary: totals } = store.getState().invoices;
    expect(current.data).toEqual(edited);
    expect(list.data?.invoices.find((invoice) => invoice.id === sent.id)).toEqual(edited);
    expect(invoicesApi.listInvoices).toHaveBeenCalledWith(defaultQuery);
    expect(invoicesApi.getInvoiceSummary).toHaveBeenCalledTimes(1);
    // The totals on screen stay until the new ones arrive.
    expect(totals.data).toEqual(summary);
  });

  it("changes the status with one thunk for every action, passing the paid date on", async () => {
    const store = await loadedStore();
    const nowPaid = { ...sent, status: "PAID" as const, paidAt: "2026-10-08T10:30:00.000Z" };
    vi.mocked(invoicesApi.changeInvoiceStatus).mockResolvedValue(nowPaid);

    await store
      .dispatch(
        changeInvoiceStatus({
          id: sent.id,
          action: "mark-paid",
          paidAt: "2026-10-08T10:30:00.000Z",
        }),
      )
      .unwrap();

    expect(invoicesApi.changeInvoiceStatus).toHaveBeenCalledWith(
      sent.id,
      "mark-paid",
      "2026-10-08T10:30:00.000Z",
    );
    expect(store.getState().invoices.current.data).toEqual(nowPaid);
    expect(
      store.getState().invoices.list.data?.invoices.find((invoice) => invoice.id === sent.id),
    ).toEqual(nowPaid);
    expect(invoicesApi.listInvoices).toHaveBeenCalledTimes(1);
    expect(invoicesApi.getInvoiceSummary).toHaveBeenCalledTimes(1);

    vi.mocked(invoicesApi.changeInvoiceStatus).mockResolvedValue({ ...sent, status: "VOID" });
    await store.dispatch(changeInvoiceStatus({ id: sent.id, action: "void" })).unwrap();
    expect(invoicesApi.changeInvoiceStatus).toHaveBeenLastCalledWith(sent.id, "void", undefined);
    expect(store.getState().invoices.current.data?.status).toBe("VOID");
  });

  it("asks for neither the list nor the summary when they were never loaded", async () => {
    vi.mocked(invoicesApi.getInvoice).mockResolvedValue(draft);
    vi.mocked(invoicesApi.changeInvoiceStatus).mockResolvedValue({ ...draft, status: "SENT" });
    const store = makeStore();
    await store.dispatch(fetchInvoice(draft.id));

    await store.dispatch(changeInvoiceStatus({ id: draft.id, action: "mark-sent" })).unwrap();

    expect(store.getState().invoices.current.data?.status).toBe("SENT");
    expect(invoicesApi.listInvoices).not.toHaveBeenCalled();
    expect(invoicesApi.getInvoiceSummary).not.toHaveBeenCalled();
  });

  it("rejects with the ApiError and leaves the loading state alone", async () => {
    const store = await loadedStore();
    const refused: ApiError = {
      code: "INVALID_STATUS_CHANGE",
      message: "Not from PAID",
      details: { status: "PAID" },
    };
    vi.mocked(invoicesApi.changeInvoiceStatus).mockRejectedValue(refused);
    vi.mocked(invoicesApi.updateInvoice).mockRejectedValue(forbidden);

    await expect(
      store.dispatch(changeInvoiceStatus({ id: sent.id, action: "mark-overdue" })).unwrap(),
    ).rejects.toEqual(refused);
    await expect(
      store.dispatch(updateInvoice({ id: sent.id, changes: { notes: "x" } })).unwrap(),
    ).rejects.toEqual(forbidden);

    const { list, current } = store.getState().invoices;
    expect(current).toMatchObject({ data: sent, status: "succeeded", error: null });
    expect(list).toMatchObject({ status: "succeeded", error: null });
    expect(invoicesApi.listInvoices).not.toHaveBeenCalled();
  });
});
