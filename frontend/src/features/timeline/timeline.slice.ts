import { createSlice, isAnyOf } from "@reduxjs/toolkit";

import { emailRecordOf } from "@/features/emails/email-record";
import * as emailsApi from "@/features/emails/emails.api";
import type { EmailMessage } from "@/features/emails/emails.types";
import type { ApiError } from "@/lib/api/http";
import type { AppDispatch, RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as timelineApi from "./timeline.api";
import type {
  AddNoteInput,
  LogConversationInput,
  RecordRef,
  TimelineEntry,
  TimelineFilter,
  TimelineKind,
  TimelineListQuery,
  TimelinePage,
} from "./timeline.types";

export const TIMELINE_PAGE_SIZE = 25;

// Which timeline is on screen: the record and the filter tab.
export type TimelineQuery = { record: RecordRef; filter: TimelineFilter };

// The usual three keys for the timeline of the record that is open, the `query` it was
// asked for, and `more`: the state of the "Load more" request, which adds a page to
// `data` and must not turn the whole list back into a loading state.
type TimelineState = {
  data: TimelinePage | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: ApiError | null;
  query: TimelineQuery | null;
  more: { status: "idle" | "loading" | "failed"; error: ApiError | null };
};

const initialState: TimelineState = {
  data: null,
  status: "idle",
  error: null,
  query: null,
  more: { status: "idle", error: null },
};

function recordKey(record: RecordRef): string {
  return `${record.type}:${record.id}`;
}

export function sameRecord(a: RecordRef, b: RecordRef | undefined): boolean {
  return b !== undefined && recordKey(a) === recordKey(b);
}

function sameQuery(a: TimelineQuery, b: TimelineQuery | null): boolean {
  return b !== null && sameRecord(a.record, b.record) && a.filter === b.filter;
}

function unknownError(message: string | undefined): ApiError {
  return { code: "UNKNOWN_ERROR", message: message ?? "Unexpected error", details: null };
}

function listQuery(filter: TimelineFilter, page: number): TimelineListQuery {
  return {
    ...(filter === "ALL" ? {} : { kind: filter }),
    page,
    pageSize: TIMELINE_PAGE_SIZE,
  };
}

// The kinds the API writes itself: what its `kind=SYSTEM` filter answers with. An email is
// not one of them: a person sent it.
const SYSTEM_KINDS: readonly TimelineKind[] = [
  "CREATED",
  "STATUS_CHANGE",
  "ASSIGNMENT",
  "QUOTE_STATUS",
  "INVOICE_STATUS",
];

// True when an entry belongs under a filter tab.
export function matchesFilter(entry: TimelineEntry, filter: TimelineFilter): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "SYSTEM":
      return SYSTEM_KINDS.includes(entry.kind);
    default:
      return entry.kind === filter;
  }
}

// Loads the first page of a timeline, replacing what was there.
export const fetchTimeline = createAppThunk(
  "timeline/fetch",
  async (query: TimelineQuery, { rejectWithValue }) => {
    try {
      return await timelineApi.listTimeline(query.record, listQuery(query.filter, 1));
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while the same one is already in flight. Another record or filter
    // is let through, and the older answer is then ignored.
    condition: (query, { getState }) => {
      const { status, query: current } = getState().timeline;
      return !(status === "loading" && sameQuery(query, current));
    },
  },
);

// "Load more": the page after the last one loaded, added to the end of the list.
export const fetchMoreTimeline = createAppThunk(
  "timeline/fetchMore",
  async (query: TimelineQuery, { getState, rejectWithValue }) => {
    try {
      const page = (getState().timeline.data?.page ?? 0) + 1;
      return await timelineApi.listTimeline(query.record, listQuery(query.filter, page));
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    condition: (query, { getState }) => {
      const { data, status, query: current, more } = getState().timeline;
      return (
        sameQuery(query, current) &&
        status === "succeeded" &&
        more.status !== "loading" &&
        data !== null &&
        data.entries.length < data.total
      );
    },
  },
);

// Loads the timeline on screen again, with the filter it has: a record page does this
// after the record changed (a new status, a new owner) so the new entry shows.
// It does nothing when another record's timeline, or none, is open.
export const refreshTimeline =
  (record: RecordRef) =>
  (dispatch: AppDispatch, getState: () => RootState): void => {
    const { query } = getState().timeline;
    if (query && sameRecord(record, query.record)) {
      void dispatch(fetchTimeline(query));
    }
  };

// A new entry that the current filter tab would hide (a conversation saved while "Notes"
// is selected) switches the timeline back to "All", so what was just saved is on screen.
function showNewEntry(
  entry: TimelineEntry,
  record: RecordRef,
  api: {
    dispatch: (action: ReturnType<typeof fetchTimeline>) => unknown;
    getState: () => RootState;
  },
): void {
  const { query } = api.getState().timeline;
  if (query && sameRecord(record, query.record) && !matchesFilter(entry, query.filter)) {
    void api.dispatch(fetchTimeline({ record, filter: "ALL" }));
  }
}

// The three thunks below are mutations: a form dispatches one, awaits `.unwrap()` and
// shows the rejection itself, so they do not touch `status` or `error`. The new entry is
// put into the list at once.
export const logConversation = createAppThunk(
  "timeline/logConversation",
  async (
    arg: { record: RecordRef; input: LogConversationInput },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const entry = await timelineApi.logConversation(arg.record, arg.input);
      showNewEntry(entry, arg.record, { dispatch, getState });
      return entry;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const addNote = createAppThunk(
  "timeline/addNote",
  async (
    arg: { record: RecordRef; input: AddNoteInput },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const entry = await timelineApi.addNote(arg.record, arg.input);
      showNewEntry(entry, arg.record, { dispatch, getState });
      return entry;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

// Sends an email from a record (POST /emails). The API answers with the EMAIL entry it
// wrote, which joins the timeline like a saved conversation; the record's own slice moves
// its "Last contact" on the same action. Nothing is written when the email did not go out.
export const sendEmail = createAppThunk(
  "timeline/sendEmail",
  async (
    arg: { record: RecordRef; input: EmailMessage },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const entry = await emailsApi.sendEmail({ record: emailRecordOf(arg.record), ...arg.input });
      showNewEntry(entry, arg.record, { dispatch, getState });
      return entry;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

const timelineSlice = createSlice({
  name: "timeline",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTimeline.pending, (state, action) => {
        // Never show one record's entries, or one tab's, under another. A reload of the
        // same timeline keeps what is on screen.
        if (!sameQuery(action.meta.arg, state.query)) {
          state.data = null;
        }
        state.query = action.meta.arg;
        state.status = "loading";
        state.error = null;
        state.more = initialState.more;
      })
      .addCase(fetchTimeline.fulfilled, (state, action) => {
        // An answer to an older query is dropped: a newer request is on its way.
        if (sameQuery(action.meta.arg, state.query)) {
          state.status = "succeeded";
          state.data = action.payload;
        }
      })
      .addCase(fetchTimeline.rejected, (state, action) => {
        if (sameQuery(action.meta.arg, state.query)) {
          state.status = "failed";
          state.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addCase(fetchMoreTimeline.pending, (state) => {
        state.more = { status: "loading", error: null };
      })
      .addCase(fetchMoreTimeline.fulfilled, (state, action) => {
        if (!sameQuery(action.meta.arg, state.query) || !state.data) {
          return;
        }
        // An entry saved since the first page was loaded moves every later entry down by
        // one, so the next page can start with one that is already here.
        const loaded = new Set(state.data.entries.map((entry) => entry.id));
        const { entries, ...meta } = action.payload;
        state.data = {
          ...meta,
          entries: [...state.data.entries, ...entries.filter((entry) => !loaded.has(entry.id))],
        };
        state.more = initialState.more;
      })
      .addCase(fetchMoreTimeline.rejected, (state, action) => {
        if (sameQuery(action.meta.arg, state.query)) {
          state.more = {
            status: "failed",
            error: action.payload ?? unknownError(action.error.message),
          };
        }
      })
      .addMatcher(
        isAnyOf(logConversation.fulfilled, addNote.fulfilled, sendEmail.fulfilled),
        (state, action) => {
          const entry = action.payload;
          if (
            !state.data ||
            !state.query ||
            !sameRecord(action.meta.arg.record, state.query.record) ||
            !matchesFilter(entry, state.query.filter)
          ) {
            return;
          }
          // Newest first by when it happened: a conversation logged for last week goes
          // below this week's entries, as it will after a reload.
          const index = state.data.entries.findIndex(
            (existing) => existing.occurredAt <= entry.occurredAt,
          );
          state.data.entries.splice(index === -1 ? state.data.entries.length : index, 0, entry);
          state.data.total += 1;
        },
      );
  },
});

export const timelineReducer = timelineSlice.reducer;

export const selectTimeline = (state: RootState) => state.timeline;
