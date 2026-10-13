import { createSlice, isAnyOf } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as quotesApi from "./quotes.api";
import type {
  CreateInvoiceInput,
  CreateQuoteInput,
  Quote,
  QuoteEmail,
  QuoteList,
  QuoteListQuery,
  UpdateQuoteInput,
} from "./quotes.types";

type Status = "idle" | "loading" | "succeeded" | "failed";

// The slice loads two things, so it holds the usual three keys twice:
//   list:    one page of quotes, with the `query` (search, filters, sort, page) it was asked for
//   current: the quote open on its page or in the editor, with the `id` it was asked for
type QuotesState = {
  list: {
    data: QuoteList | null;
    status: Status;
    error: ApiError | null;
    query: QuoteListQuery | null;
  };
  current: { data: Quote | null; status: Status; error: ApiError | null; id: string | null };
};

const initialState: QuotesState = {
  list: { data: null, status: "idle", error: null, query: null },
  current: { data: null, status: "idle", error: null, id: null },
};

function sameQuery(a: QuoteListQuery, b: QuoteListQuery | null): boolean {
  if (!b) {
    return false;
  }
  const keys = Object.keys({ ...a, ...b }) as (keyof QuoteListQuery)[];
  return keys.every((key) => a[key] === b[key]);
}

function unknownError(message: string | undefined): ApiError {
  return { code: "UNKNOWN_ERROR", message: message ?? "Unexpected error", details: null };
}

export const fetchQuotes = createAppThunk(
  "quotes/fetch",
  async (query: QuoteListQuery, { rejectWithValue }) => {
    try {
      return await quotesApi.listQuotes(query);
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while the same one is already in flight. A different query (the user
    // typed on, or changed a filter) is let through, and the older answer is then ignored.
    condition: (query, { getState }) => {
      const { list } = getState().quotes;
      return !(list.status === "loading" && sameQuery(query, list.query));
    },
  },
);

export const fetchQuote = createAppThunk(
  "quotes/fetchOne",
  async (id: string, { rejectWithValue }) => {
    try {
      return await quotesApi.getQuote(id);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    condition: (id, { getState }) => {
      const { current } = getState().quotes;
      return !(current.status === "loading" && current.id === id);
    },
  },
);

type ThunkTools = {
  dispatch: (action: ReturnType<typeof fetchQuotes>) => unknown;
  getState: () => RootState;
};

// Reloads the list with the query it was last loaded with, so a change shows where it
// belongs under the current filters and sort.
function reloadList({ dispatch, getState }: ThunkTools): void {
  const { query } = getState().quotes.list;
  if (query) {
    void dispatch(fetchQuotes(query));
  }
}

// The thunks below are mutations: a form, a button or a dialog dispatches one, awaits
// `.unwrap()` and shows the rejection itself, so they do not touch `status` or `error`. The
// API's quote is put in `current` and in the list at once, and the list is then reloaded.
export const createQuote = createAppThunk(
  "quotes/create",
  async (input: CreateQuoteInput, { dispatch, getState, rejectWithValue }) => {
    try {
      const quote = await quotesApi.createQuote(input);
      reloadList({ dispatch, getState });
      return quote;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const updateQuote = createAppThunk(
  "quotes/update",
  async (
    arg: { id: string; changes: UpdateQuoteInput },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const quote = await quotesApi.updateQuote(arg.id, arg.changes);
      reloadList({ dispatch, getState });
      return quote;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const deleteQuote = createAppThunk(
  "quotes/delete",
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    try {
      await quotesApi.deleteQuote(id);
      reloadList({ dispatch, getState });
      return id;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

// A new draft with the same buyer, lines and discount, from a quote in any status.
export const duplicateQuote = createAppThunk(
  "quotes/duplicate",
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    try {
      const quote = await quotesApi.duplicateQuote(id);
      reloadList({ dispatch, getState });
      return quote;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

// Without `email` the quote is only marked as sent; with it the API emails the quote first
// and marks it only when the mail server took the message.
export const sendQuote = createAppThunk(
  "quotes/send",
  async (arg: { id: string; email?: QuoteEmail }, { dispatch, getState, rejectWithValue }) => {
    try {
      const quote = await quotesApi.sendQuote(arg.id, arg.email);
      reloadList({ dispatch, getState });
      return quote;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const changeQuoteStatus = createAppThunk(
  "quotes/changeStatus",
  async (
    arg: { id: string; action: "accept" | "decline" | "reopen" },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const quote = await quotesApi.changeQuoteStatus(arg.id, arg.action);
      reloadList({ dispatch, getState });
      return quote;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

// Makes the one invoice of an accepted quote. The API answers with the invoice; the quote
// in the store then names it, so the page offers "View invoice" instead of "Create invoice".
export const createQuoteInvoice = createAppThunk(
  "quotes/createInvoice",
  async (
    arg: { id: string; input?: CreateInvoiceInput },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const invoice = await quotesApi.createInvoice(arg.id, arg.input);
      reloadList({ dispatch, getState });
      return invoice;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

// Replaces the quote in the list, when the page on screen holds it.
function putInList(state: QuotesState, quote: Quote): void {
  const index = state.list.data?.quotes.findIndex((existing) => existing.id === quote.id);
  if (state.list.data && index !== undefined && index !== -1) {
    state.list.data.quotes[index] = quote;
  }
}

const quotesSlice = createSlice({
  name: "quotes",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchQuotes.pending, (state, action) => {
        state.list.status = "loading";
        state.list.error = null;
        state.list.query = action.meta.arg;
      })
      .addCase(fetchQuotes.fulfilled, (state, action) => {
        // An answer to an older query is dropped: a newer request is on its way.
        if (sameQuery(action.meta.arg, state.list.query)) {
          state.list.status = "succeeded";
          state.list.data = action.payload;
        }
      })
      .addCase(fetchQuotes.rejected, (state, action) => {
        if (sameQuery(action.meta.arg, state.list.query)) {
          state.list.status = "failed";
          state.list.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addCase(fetchQuote.pending, (state, action) => {
        // Never show one quote under another quote's address.
        if (state.current.id !== action.meta.arg) {
          state.current.data = null;
        }
        state.current.id = action.meta.arg;
        state.current.status = "loading";
        state.current.error = null;
      })
      .addCase(fetchQuote.fulfilled, (state, action) => {
        if (state.current.id === action.meta.arg) {
          state.current.status = "succeeded";
          state.current.data = action.payload;
        }
      })
      .addCase(fetchQuote.rejected, (state, action) => {
        if (state.current.id === action.meta.arg) {
          state.current.status = "failed";
          state.current.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addCase(deleteQuote.fulfilled, (state, action) => {
        if (state.list.data) {
          state.list.data.quotes = state.list.data.quotes.filter(
            (quote) => quote.id !== action.payload,
          );
        }
        if (state.current.id === action.payload) {
          state.current = initialState.current;
        }
      })
      .addCase(createQuoteInvoice.fulfilled, (state, action) => {
        const { id, number, quote } = action.payload;
        for (const held of [state.current.data, ...(state.list.data?.quotes ?? [])]) {
          if (held?.id === quote.id) {
            held.invoice = { id, number };
          }
        }
      })
      // A quote that was just made is the one the user is taken to: it becomes `current`,
      // so its page shows at once.
      .addMatcher(isAnyOf(createQuote.fulfilled, duplicateQuote.fulfilled), (state, action) => {
        state.current = {
          data: action.payload,
          status: "succeeded",
          error: null,
          id: action.payload.id,
        };
      })
      .addMatcher(
        isAnyOf(updateQuote.fulfilled, sendQuote.fulfilled, changeQuoteStatus.fulfilled),
        (state, action) => {
          const quote = action.payload;
          putInList(state, quote);
          if (state.current.id === quote.id) {
            state.current.data = quote;
            state.current.status = "succeeded";
            state.current.error = null;
          }
        },
      );
  },
});

export const quotesReducer = quotesSlice.reducer;

export const selectQuoteList = (state: RootState) => state.quotes.list;
export const selectCurrentQuote = (state: RootState) => state.quotes.current;
