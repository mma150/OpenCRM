import { createSlice, isAnyOf } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as emailSettingsApi from "./email-settings.api";
import type { EmailSettings, EmailStatus, UpdateEmailSettingsInput } from "./email-settings.types";

type Loaded<T> = {
  data: T | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: ApiError | null;
};

// Two things: `status` (is email on? every user may ask; the "Send email" action and the
// "email is off" notes read it) and `settings` (the mail server, for the Admin's page).
type EmailSettingsState = { status: Loaded<EmailStatus>; settings: Loaded<EmailSettings> };

const initialState: EmailSettingsState = {
  status: { data: null, status: "idle", error: null },
  settings: { data: null, status: "idle", error: null },
};

function unknownError(message: string | undefined): ApiError {
  return { code: "UNKNOWN_ERROR", message: message ?? "Unexpected error", details: null };
}

export const fetchEmailStatus = createAppThunk(
  "emailSettings/fetchStatus",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      return await emailSettingsApi.getEmailStatus();
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while one is already in flight.
    condition: (_arg, { getState }) => getState().emailSettings.status.status !== "loading",
  },
);

export const fetchEmailSettings = createAppThunk(
  "emailSettings/fetch",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      return await emailSettingsApi.getEmailSettings();
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    condition: (_arg, { getState }) => getState().emailSettings.settings.status !== "loading",
  },
);

// The two thunks below are mutations (Admin only): the form dispatches one, awaits
// `.unwrap()` and shows the rejection itself. Each answers with the settings then in effect.
export const saveEmailSettings = createAppThunk(
  "emailSettings/save",
  async (input: UpdateEmailSettingsInput, { rejectWithValue }) => {
    try {
      return await emailSettingsApi.saveEmailSettings(input);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const removeEmailSettings = createAppThunk(
  "emailSettings/remove",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      return await emailSettingsApi.removeEmailSettings();
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

const emailSettingsSlice = createSlice({
  name: "emailSettings",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEmailStatus.pending, (state) => {
        state.status.status = "loading";
        state.status.error = null;
      })
      .addCase(fetchEmailStatus.fulfilled, (state, action) => {
        state.status.status = "succeeded";
        state.status.data = action.payload;
      })
      .addCase(fetchEmailStatus.rejected, (state, action) => {
        state.status.status = "failed";
        state.status.error = action.payload ?? unknownError(action.error.message);
      })
      .addCase(fetchEmailSettings.pending, (state) => {
        state.settings.status = "loading";
        state.settings.error = null;
      })
      .addCase(fetchEmailSettings.rejected, (state, action) => {
        state.settings.status = "failed";
        state.settings.error = action.payload ?? unknownError(action.error.message);
      })
      .addMatcher(
        isAnyOf(
          fetchEmailSettings.fulfilled,
          saveEmailSettings.fulfilled,
          removeEmailSettings.fulfilled,
        ),
        (state, action) => {
          state.settings.status = "succeeded";
          state.settings.error = null;
          state.settings.data = action.payload;
          // Whether email is on follows from where the settings come from, so the notes
          // and actions that read `status` follow a change on the settings page at once.
          state.status.data = { enabled: action.payload.source !== "NONE" };
          state.status.status = "succeeded";
          state.status.error = null;
        },
      );
  },
});

export const emailSettingsReducer = emailSettingsSlice.reducer;

export const selectEmailStatus = (state: RootState) => state.emailSettings.status;
export const selectEmailSettings = (state: RootState) => state.emailSettings.settings;
