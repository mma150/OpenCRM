import { createSlice, isAnyOf } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as invoicesApi from "./invoices.api";
import type {
  Invoice,
  InvoiceAction,
  InvoiceList,
  InvoiceListQuery,
  InvoiceSummary,
  UpdateInvoiceInput,
} from "./invoices.types";

type Status = "idle" | "loading" | "succeeded" | "failed";

// The slice loads three things, so it holds the usual three keys three times:
//   list:    one page of invoices, with the `query` (search, filters, sort, page) it was asked for
//   summary: the outstanding, overdue and paid-this-month totals over the invoices the viewer sees
//   current: the invoice open on its page, with the `id` it was asked for
type InvoicesState = {
  list: {
    data: InvoiceList | null;
    status: Status;
    error: ApiError | null;
    query: InvoiceListQuery | null;
  };
  summary: { data: InvoiceSummary | null; status: Status; error: ApiError | null };
  current: { data: Invoice | null; status: Status; error: ApiError | null; id: string | null };
};

const initialState: InvoicesState = {
  list: { data: null, status: "idle", error: null, query: null },
  summary: { data: null, status: "idle", error: null },
  current: { data: null, status: "idle", error: null, id: null },
};

function sameQuery(a: InvoiceListQuery, b: InvoiceListQuery | null): boolean {
  if (!b) {
    return false;
  }
  const keys = Object.keys({ ...a, ...b }) as (keyof InvoiceListQuery)[];
  return keys.every((key) => a[key] === b[key]);
}

function unknownError(message: string | undefined): ApiError {
  return { code: "UNKNOWN_ERROR", message: message ?? "Unexpected error", details: null };
}

export const fetchInvoices = createAppThunk(
  "invoices/fetch",
  async (query: InvoiceListQuery, { rejectWithValue }) => {
    try {
      return await invoicesApi.listInvoices(query);
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while the same one is already in flight. A different query (the user
    // typed on, or changed a filter) is let through, and the older answer is then ignored.
    condition: (query, { getState }) => {
      const { list } = getState().invoices;
      return !(list.status === "loading" && sameQuery(query, list.query));
    },
  },
);

export const fetchInvoiceSummary = createAppThunk(
  "invoices/fetchSummary",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      return await invoicesApi.getInvoiceSummary();
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    condition: (_arg, { getState }) => getState().invoices.summary.status !== "loading",
  },
);

export const fetchInvoice = createAppThunk(
  "invoices/fetchOne",
  async (id: string, { rejectWithValue }) => {
    try {
      return await invoicesApi.getInvoice(id);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    condition: (id, { getState }) => {
      const { current } = getState().invoices;
      return !(current.status === "loading" && current.id === id);
    },
  },
);

type ThunkTools = {
  dispatch: (action: ReturnType<typeof fetchInvoices | typeof fetchInvoiceSummary>) => unknown;
  getState: () => RootState;
};

// After a change: the list is loaded again with the query it was last loaded with, so the
// invoice shows where it belongs under the current filters and sort, and so are the totals,
// which are the API's to count. Neither is asked for when it was never loaded.
function reloadListAndSummary({ dispatch, getState }: ThunkTools): void {
  const { list, summary } = getState().invoices;
  if (list.query) {
    void dispatch(fetchInvoices(list.query));
  }
  if (summary.status !== "idle") {
    void dispatch(fetchInvoiceSummary());
  }
}

// The two thunks below are mutations: a dialog or a button dispatches one, awaits
// `.unwrap()` and shows the rejection itself, so they do not touch `status` or `error`. The
// API's invoice is put in the list and in `current` at once.

// Only the due date and the notes of an invoice can be edited.
export const updateInvoice = createAppThunk(
  "invoices/update",
  async (
    arg: { id: string; changes: UpdateInvoiceInput },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const invoice = await invoicesApi.updateInvoice(arg.id, arg.changes);
      reloadListAndSummary({ dispatch, getState });
      return invoice;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

// Every status change is this one thunk: mark sent, paid (with the moment it was paid, now
// when left out), overdue or unpaid, void and restore.
export const changeInvoiceStatus = createAppThunk(
  "invoices/changeStatus",
  async (
    arg: { id: string; action: InvoiceAction; paidAt?: string },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const invoice = await invoicesApi.changeInvoiceStatus(arg.id, arg.action, arg.paidAt);
      reloadListAndSummary({ dispatch, getState });
      return invoice;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

const invoicesSlice = createSlice({
  name: "invoices",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchInvoices.pending, (state, action) => {
        state.list.status = "loading";
        state.list.error = null;
        state.list.query = action.meta.arg;
      })
      .addCase(fetchInvoices.fulfilled, (state, action) => {
        // An answer to an older query is dropped: a newer request is on its way.
        if (sameQuery(action.meta.arg, state.list.query)) {
          state.list.status = "succeeded";
          state.list.data = action.payload;
        }
      })
      .addCase(fetchInvoices.rejected, (state, action) => {
        if (sameQuery(action.meta.arg, state.list.query)) {
          state.list.status = "failed";
          state.list.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addCase(fetchInvoiceSummary.pending, (state) => {
        state.summary.status = "loading";
        state.summary.error = null;
      })
      .addCase(fetchInvoiceSummary.fulfilled, (state, action) => {
        state.summary.status = "succeeded";
        state.summary.data = action.payload;
      })
      .addCase(fetchInvoiceSummary.rejected, (state, action) => {
        state.summary.status = "failed";
        state.summary.error = action.payload ?? unknownError(action.error.message);
      })
      .addCase(fetchInvoice.pending, (state, action) => {
        // Never show one invoice under another invoice's address.
        if (state.current.id !== action.meta.arg) {
          state.current.data = null;
        }
        state.current.id = action.meta.arg;
        state.current.status = "loading";
        state.current.error = null;
      })
      .addCase(fetchInvoice.fulfilled, (state, action) => {
        if (state.current.id === action.meta.arg) {
          state.current.status = "succeeded";
          state.current.data = action.payload;
        }
      })
      .addCase(fetchInvoice.rejected, (state, action) => {
        if (state.current.id === action.meta.arg) {
          state.current.status = "failed";
          state.current.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addMatcher(
        isAnyOf(updateInvoice.fulfilled, changeInvoiceStatus.fulfilled),
        (state, action) => {
          const invoice = action.payload;
          const index = state.list.data?.invoices.findIndex(
            (existing) => existing.id === invoice.id,
          );
          if (state.list.data && index !== undefined && index !== -1) {
            state.list.data.invoices[index] = invoice;
          }
          if (state.current.id === invoice.id) {
            state.current.data = invoice;
          }
        },
      );
  },
});

export const invoicesReducer = invoicesSlice.reducer;

export const selectInvoiceList = (state: RootState) => state.invoices.list;
export const selectInvoiceSummary = (state: RootState) => state.invoices.summary;
export const selectCurrentInvoice = (state: RootState) => state.invoices.current;
