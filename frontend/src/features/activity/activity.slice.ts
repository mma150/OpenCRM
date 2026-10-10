import { createSlice } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as activityApi from "./activity.api";
import type { ActivityAuthor, ActivityList, ActivityListQuery } from "./activity.types";

type Status = "idle" | "loading" | "succeeded" | "failed";

// The slice loads two things, so it holds the usual three keys twice:
//   list:    one page of the feed, with the `query` (person, dates, kind, page) it was asked for
//   authors: the people in the Person filter
type ActivityState = {
  list: {
    data: ActivityList | null;
    status: Status;
    error: ApiError | null;
    query: ActivityListQuery | null;
  };
  authors: { data: ActivityAuthor[] | null; status: Status; error: ApiError | null };
};

const initialState: ActivityState = {
  list: { data: null, status: "idle", error: null, query: null },
  authors: { data: null, status: "idle", error: null },
};

function sameQuery(a: ActivityListQuery, b: ActivityListQuery | null): boolean {
  if (!b) {
    return false;
  }
  const keys = Object.keys({ ...a, ...b }) as (keyof ActivityListQuery)[];
  return keys.every((key) => a[key] === b[key]);
}

function unknownError(message: string | undefined): ApiError {
  return { code: "UNKNOWN_ERROR", message: message ?? "Unexpected error", details: null };
}

export const fetchActivity = createAppThunk(
  "activity/fetch",
  async (query: ActivityListQuery, { rejectWithValue }) => {
    try {
      return await activityApi.listActivity(query);
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while the same one is already in flight. A different query (another
    // filter or page) is let through, and the older answer is then ignored.
    condition: (query, { getState }) => {
      const { list } = getState().activity;
      return !(list.status === "loading" && sameQuery(query, list.query));
    },
  },
);

export const fetchActivityAuthors = createAppThunk(
  "activity/fetchAuthors",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      return await activityApi.listActivityAuthors();
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    condition: (_arg, { getState }) => getState().activity.authors.status !== "loading",
  },
);

const activitySlice = createSlice({
  name: "activity",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchActivity.pending, (state, action) => {
        state.list.status = "loading";
        state.list.error = null;
        state.list.query = action.meta.arg;
      })
      .addCase(fetchActivity.fulfilled, (state, action) => {
        // An answer to an older query is dropped: a newer request is on its way.
        if (sameQuery(action.meta.arg, state.list.query)) {
          state.list.status = "succeeded";
          state.list.data = action.payload;
        }
      })
      .addCase(fetchActivity.rejected, (state, action) => {
        if (sameQuery(action.meta.arg, state.list.query)) {
          state.list.status = "failed";
          state.list.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addCase(fetchActivityAuthors.pending, (state) => {
        state.authors.status = "loading";
        state.authors.error = null;
      })
      .addCase(fetchActivityAuthors.fulfilled, (state, action) => {
        state.authors.status = "succeeded";
        state.authors.data = action.payload;
      })
      .addCase(fetchActivityAuthors.rejected, (state, action) => {
        state.authors.status = "failed";
        state.authors.error = action.payload ?? unknownError(action.error.message);
      });
  },
});

export const activityReducer = activitySlice.reducer;

export const selectActivityList = (state: RootState) => state.activity.list;
export const selectActivityAuthors = (state: RootState) => state.activity.authors;
