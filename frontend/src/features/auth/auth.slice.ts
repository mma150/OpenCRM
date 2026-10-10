import { createSlice, isAnyOf } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as authApi from "./auth.api";
import type {
  ChangePasswordInput,
  LoginInput,
  Me,
  SetupInput,
  TokenPasswordInput,
  UpdateProfileInput,
} from "./auth.types";

// `data` is the signed-in user. `status` and `error` describe loading that user (fetchMe):
// "failed" with the code UNAUTHENTICATED means "signed out", any other code is a real failure.
type AuthState = {
  data: Me | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: ApiError | null;
};

const initialState: AuthState = { data: null, status: "idle", error: null };

const signedOutState: AuthState = {
  data: null,
  status: "failed",
  error: { code: "UNAUTHENTICATED", message: "Not signed in", details: null },
};

export const fetchMe = createAppThunk(
  "auth/fetchMe",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      return await authApi.getMe();
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while one is already in flight.
    condition: (_arg, { getState }) => getState().auth.status !== "loading",
  },
);

// The thunks below are mutations: a form dispatches one, awaits `.unwrap()` and shows the
// rejection itself, so they do not touch `status` or `error`.
export const login = createAppThunk(
  "auth/login",
  async (input: LoginInput, { rejectWithValue }) => {
    try {
      return await authApi.login(input);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const setupAdmin = createAppThunk(
  "auth/setupAdmin",
  async (input: SetupInput, { rejectWithValue }) => {
    try {
      return await authApi.setupAdmin(input);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const acceptInvite = createAppThunk(
  "auth/acceptInvite",
  async (input: TokenPasswordInput, { rejectWithValue }) => {
    try {
      return await authApi.acceptInvite(input);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const updateProfile = createAppThunk(
  "auth/updateProfile",
  async (input: UpdateProfileInput, { rejectWithValue }) => {
    try {
      return await authApi.updateMe(input);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const changePassword = createAppThunk(
  "auth/changePassword",
  async (input: ChangePasswordInput, { rejectWithValue }) => {
    try {
      await authApi.changePassword(input);
      return null;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const logout = createAppThunk(
  "auth/logout",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      await authApi.logout();
      return null;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    // Dispatched by the HTTP client when any request is answered with UNAUTHENTICATED.
    sessionExpired: () => signedOutState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMe.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.data = action.payload;
      })
      .addCase(fetchMe.rejected, (state, action) => {
        state.status = "failed";
        state.data = null;
        state.error = action.payload ?? {
          code: "UNKNOWN_ERROR",
          message: action.error.message ?? "Unexpected error",
          details: null,
        };
      })
      .addCase(logout.fulfilled, () => signedOutState)
      // Each of these answers with the signed-in user.
      .addMatcher(
        isAnyOf(
          login.fulfilled,
          setupAdmin.fulfilled,
          acceptInvite.fulfilled,
          updateProfile.fulfilled,
        ),
        (state, action) => {
          state.status = "succeeded";
          state.data = action.payload;
          state.error = null;
        },
      );
  },
});

export const { sessionExpired } = authSlice.actions;

export const authReducer = authSlice.reducer;

export const selectAuth = (state: RootState) => state.auth;
