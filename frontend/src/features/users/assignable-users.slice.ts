import { createSlice } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as usersApi from "./users.api";
import type { AssignableUser } from "./users.types";

// Who the signed-in user may assign a record to. Every module with an owner field (leads,
// later contacts, companies and opportunities) reads its owner options from here.
type AssignableUsersState = {
  data: AssignableUser[] | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: ApiError | null;
};

const initialState: AssignableUsersState = { data: null, status: "idle", error: null };

export const fetchAssignableUsers = createAppThunk(
  "assignableUsers/fetch",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      return await usersApi.listAssignableUsers();
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while one is already in flight.
    condition: (_arg, { getState }) => getState().assignableUsers.status !== "loading",
  },
);

const assignableUsersSlice = createSlice({
  name: "assignableUsers",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAssignableUsers.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchAssignableUsers.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.data = action.payload;
      })
      .addCase(fetchAssignableUsers.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload ?? {
          code: "UNKNOWN_ERROR",
          message: action.error.message ?? "Unexpected error",
          details: null,
        };
      });
  },
});

export const assignableUsersReducer = assignableUsersSlice.reducer;

export const selectAssignableUsers = (state: RootState) => state.assignableUsers;
