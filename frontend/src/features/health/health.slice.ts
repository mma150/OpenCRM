import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";

import { getHealth, type Health } from "./health.api";

type HealthState = {
  data: Health | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: ApiError | null;
};

const initialState: HealthState = { data: null, status: "idle", error: null };

export const fetchHealth = createAsyncThunk.withTypes<{
  state: RootState;
  rejectValue: ApiError;
}>()(
  "health/fetch",
  async (_arg: void, { rejectWithValue }) => {
    try {
      return await getHealth();
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while one is already in flight.
    condition: (_arg, { getState }) => getState().health.status !== "loading",
  },
);

const healthSlice = createSlice({
  name: "health",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchHealth.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchHealth.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.data = action.payload;
      })
      .addCase(fetchHealth.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload ?? {
          code: "UNKNOWN_ERROR",
          message: action.error.message ?? "Unexpected error",
          details: null,
        };
      });
  },
});

export const healthReducer = healthSlice.reducer;

export const selectHealth = (state: RootState) => state.health;
