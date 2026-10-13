import { createSlice, isAnyOf } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as organizationApi from "./organization.api";
import type { OrganizationSettings, UpdateOrganizationInput } from "./organization.types";

// The organisation's details and the defaults of a new quote: for the settings page, the
// product dialog ("use the organisation's default tax rate") and the quote editor.
type OrganizationState = {
  data: OrganizationSettings | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: ApiError | null;
};

const initialState: OrganizationState = { data: null, status: "idle", error: null };

export const fetchOrganization = createAppThunk(
  "organization/fetch",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      return await organizationApi.getOrganization();
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while one is already in flight.
    condition: (_arg, { getState }) => getState().organization.status !== "loading",
  },
);

// A mutation (Admin only): the form awaits `.unwrap()` and shows the rejection itself.
export const saveOrganization = createAppThunk(
  "organization/save",
  async (input: UpdateOrganizationInput, { rejectWithValue }) => {
    try {
      return await organizationApi.saveOrganization(input);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

const organizationSlice = createSlice({
  name: "organization",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrganization.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchOrganization.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload ?? {
          code: "UNKNOWN_ERROR",
          message: action.error.message ?? "Unexpected error",
          details: null,
        };
      })
      .addMatcher(
        isAnyOf(fetchOrganization.fulfilled, saveOrganization.fulfilled),
        (state, action) => {
          state.status = "succeeded";
          state.error = null;
          state.data = action.payload;
        },
      );
  },
});

export const organizationReducer = organizationSlice.reducer;

export const selectOrganization = (state: RootState) => state.organization;
