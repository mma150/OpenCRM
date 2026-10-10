import { createSlice } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as dashboardApi from "./dashboard.api";
import type { MyDashboard, TeamDashboard, TeamDashboardQuery } from "./dashboard.types";

type Status = "idle" | "loading" | "succeeded" | "failed";

// The slice loads two things, so it holds the usual three keys twice:
//   me:   the signed-in user's own figures and lists (everyone)
//   team: what each person on the team did in a range of days, with the `query` (the range)
//         it was asked for. Only an Admin or a Sales Manager ever asks for it.
type DashboardState = {
  me: { data: MyDashboard | null; status: Status; error: ApiError | null };
  team: {
    data: TeamDashboard | null;
    status: Status;
    error: ApiError | null;
    query: TeamDashboardQuery | null;
  };
};

const initialState: DashboardState = {
  me: { data: null, status: "idle", error: null },
  team: { data: null, status: "idle", error: null, query: null },
};

function sameRange(a: TeamDashboardQuery, b: TeamDashboardQuery | null): boolean {
  return b !== null && a.from === b.from && a.to === b.to;
}

function unknownError(message: string | undefined): ApiError {
  return { code: "UNKNOWN_ERROR", message: message ?? "Unexpected error", details: null };
}

export const fetchMyDashboard = createAppThunk(
  "dashboard/fetchMe",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      return await dashboardApi.getMyDashboard();
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while one is already in flight.
    condition: (_arg, { getState }) => getState().dashboard.me.status !== "loading",
  },
);

export const fetchTeamDashboard = createAppThunk(
  "dashboard/fetchTeam",
  async (query: TeamDashboardQuery, { rejectWithValue }) => {
    try {
      return await dashboardApi.getTeamDashboard(query);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while the same range is already loading. Another range is let
    // through, and the older answer is then ignored.
    condition: (query, { getState }) => {
      const { team } = getState().dashboard;
      return !(team.status === "loading" && sameRange(query, team.query));
    },
  },
);

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyDashboard.pending, (state) => {
        state.me.status = "loading";
        state.me.error = null;
      })
      .addCase(fetchMyDashboard.fulfilled, (state, action) => {
        state.me.status = "succeeded";
        state.me.data = action.payload;
      })
      .addCase(fetchMyDashboard.rejected, (state, action) => {
        state.me.status = "failed";
        state.me.error = action.payload ?? unknownError(action.error.message);
      })
      .addCase(fetchTeamDashboard.pending, (state, action) => {
        state.team.status = "loading";
        state.team.error = null;
        state.team.query = action.meta.arg;
      })
      .addCase(fetchTeamDashboard.fulfilled, (state, action) => {
        // An answer to an older range is dropped: a newer request is on its way.
        if (sameRange(action.meta.arg, state.team.query)) {
          state.team.status = "succeeded";
          state.team.data = action.payload;
        }
      })
      .addCase(fetchTeamDashboard.rejected, (state, action) => {
        if (sameRange(action.meta.arg, state.team.query)) {
          state.team.status = "failed";
          state.team.error = action.payload ?? unknownError(action.error.message);
        }
      });
  },
});

export const dashboardReducer = dashboardSlice.reducer;

export const selectMyDashboard = (state: RootState) => state.dashboard.me;
export const selectTeamDashboard = (state: RootState) => state.dashboard.team;
