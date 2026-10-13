import { createSlice, isAnyOf } from "@reduxjs/toolkit";

import { logConversation, sendEmail } from "@/features/timeline/timeline.slice";
import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as leadsApi from "./leads.api";
import type {
  ConvertLeadInput,
  CreateLeadInput,
  FollowUpInput,
  Lead,
  LeadList,
  LeadListQuery,
  MarkLeadLostInput,
  UpdateLeadInput,
} from "./leads.types";

type Status = "idle" | "loading" | "succeeded" | "failed";

// The slice loads two things, so it holds the usual three keys twice:
//   list:    one page of leads, with the `query` (search, filters, sort, page) it was asked for
//   current: the lead open on the detail or edit page, with the `id` it was asked for
type LeadsState = {
  list: {
    data: LeadList | null;
    status: Status;
    error: ApiError | null;
    query: LeadListQuery | null;
  };
  current: { data: Lead | null; status: Status; error: ApiError | null; id: string | null };
};

const initialState: LeadsState = {
  list: { data: null, status: "idle", error: null, query: null },
  current: { data: null, status: "idle", error: null, id: null },
};

function sameQuery(a: LeadListQuery, b: LeadListQuery | null): boolean {
  if (!b) {
    return false;
  }
  const keys = Object.keys({ ...a, ...b }) as (keyof LeadListQuery)[];
  return keys.every((key) => a[key] === b[key]);
}

function unknownError(message: string | undefined): ApiError {
  return { code: "UNKNOWN_ERROR", message: message ?? "Unexpected error", details: null };
}

export const fetchLeads = createAppThunk(
  "leads/fetch",
  async (query: LeadListQuery, { rejectWithValue }) => {
    try {
      return await leadsApi.listLeads(query);
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while the same one is already in flight. A different query (the user
    // typed on, or changed a filter) is let through, and the older answer is then ignored.
    condition: (query, { getState }) => {
      const { list } = getState().leads;
      return !(list.status === "loading" && sameQuery(query, list.query));
    },
  },
);

export const fetchLead = createAppThunk(
  "leads/fetchOne",
  async (id: string, { rejectWithValue }) => {
    try {
      return await leadsApi.getLead(id);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    condition: (id, { getState }) => {
      const { current } = getState().leads;
      return !(current.status === "loading" && current.id === id);
    },
  },
);

// Reloads the list with the query it was last loaded with, so a change shows where it
// belongs under the current filters and sort (a lost lead leaves a "New" filter).
function reloadList(api: {
  dispatch: (action: ReturnType<typeof fetchLeads>) => unknown;
  getState: () => RootState;
}): void {
  const { query } = api.getState().leads.list;
  if (query) {
    void api.dispatch(fetchLeads(query));
  }
}

// The thunks below are mutations: a form or dialog dispatches one, awaits `.unwrap()` and
// shows the rejection itself, so they do not touch `status` or `error`. The returned lead is
// put in the list and in `current` at once, and the list is then reloaded.
export const createLead = createAppThunk(
  "leads/create",
  async (input: CreateLeadInput, { dispatch, getState, rejectWithValue }) => {
    try {
      const lead = await leadsApi.createLead(input);
      reloadList({ dispatch, getState });
      return lead;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const updateLead = createAppThunk(
  "leads/update",
  async (
    arg: { id: string; changes: UpdateLeadInput },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const lead = await leadsApi.updateLead(arg.id, arg.changes);
      reloadList({ dispatch, getState });
      return lead;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const markLeadLost = createAppThunk(
  "leads/markLost",
  async (
    arg: { id: string; input: MarkLeadLostInput },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const lead = await leadsApi.markLeadLost(arg.id, arg.input);
      reloadList({ dispatch, getState });
      return lead;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const convertLead = createAppThunk(
  "leads/convert",
  async (arg: { id: string; input: ConvertLeadInput }, { dispatch, getState, rejectWithValue }) => {
    try {
      const lead = await leadsApi.convertLead(arg.id, arg.input);
      reloadList({ dispatch, getState });
      return lead;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const assignLead = createAppThunk(
  "leads/assign",
  async (arg: { id: string; ownerId: string }, { dispatch, getState, rejectWithValue }) => {
    try {
      const lead = await leadsApi.assignLead(arg.id, arg.ownerId);
      reloadList({ dispatch, getState });
      return lead;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const setLeadFollowUp = createAppThunk(
  "leads/setFollowUp",
  async (arg: { id: string; input: FollowUpInput }, { dispatch, getState, rejectWithValue }) => {
    try {
      const lead = await leadsApi.setLeadFollowUp(arg.id, arg.input);
      reloadList({ dispatch, getState });
      return lead;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const deleteLead = createAppThunk(
  "leads/delete",
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    try {
      await leadsApi.deleteLead(id);
      reloadList({ dispatch, getState });
      return id;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

const leadsSlice = createSlice({
  name: "leads",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchLeads.pending, (state, action) => {
        state.list.status = "loading";
        state.list.error = null;
        state.list.query = action.meta.arg;
      })
      .addCase(fetchLeads.fulfilled, (state, action) => {
        // An answer to an older query is dropped: a newer request is on its way.
        if (sameQuery(action.meta.arg, state.list.query)) {
          state.list.status = "succeeded";
          state.list.data = action.payload;
        }
      })
      .addCase(fetchLeads.rejected, (state, action) => {
        if (sameQuery(action.meta.arg, state.list.query)) {
          state.list.status = "failed";
          state.list.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addCase(fetchLead.pending, (state, action) => {
        // Never show one lead under another lead's address.
        if (state.current.id !== action.meta.arg) {
          state.current.data = null;
        }
        state.current.id = action.meta.arg;
        state.current.status = "loading";
        state.current.error = null;
      })
      .addCase(fetchLead.fulfilled, (state, action) => {
        if (state.current.id === action.meta.arg) {
          state.current.status = "succeeded";
          state.current.data = action.payload;
        }
      })
      .addCase(fetchLead.rejected, (state, action) => {
        if (state.current.id === action.meta.arg) {
          state.current.status = "failed";
          state.current.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addCase(deleteLead.fulfilled, (state, action) => {
        if (state.list.data) {
          state.list.data.leads = state.list.data.leads.filter(
            (lead) => lead.id !== action.payload,
          );
        }
        if (state.current.id === action.payload) {
          state.current = initialState.current;
        }
      })
      // A conversation logged on the open lead, or an email sent from it, moves its
      // "Last contact" forward, as the API does, without loading the lead again.
      .addMatcher(isAnyOf(logConversation.fulfilled, sendEmail.fulfilled), (state, action) => {
        const { record } = action.meta.arg;
        const lead = state.current.data;
        if (!lead || record.type !== "lead" || lead.id !== record.id) {
          return;
        }
        const { occurredAt } = action.payload;
        if (lead.lastContactAt === null || lead.lastContactAt < occurredAt) {
          lead.lastContactAt = occurredAt;
        }
      })
      .addMatcher(
        isAnyOf(
          updateLead.fulfilled,
          markLeadLost.fulfilled,
          convertLead.fulfilled,
          assignLead.fulfilled,
          setLeadFollowUp.fulfilled,
        ),
        (state, action) => {
          const lead = action.payload;
          const index = state.list.data?.leads.findIndex((existing) => existing.id === lead.id);
          if (state.list.data && index !== undefined && index !== -1) {
            state.list.data.leads[index] = lead;
          }
          if (state.current.id === lead.id) {
            state.current.data = lead;
          }
        },
      );
  },
});

export const leadsReducer = leadsSlice.reducer;

export const selectLeadList = (state: RootState) => state.leads.list;
export const selectCurrentLead = (state: RootState) => state.leads.current;
