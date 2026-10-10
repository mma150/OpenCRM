import { createSlice, isAnyOf } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as usersApi from "./users.api";
import type { InviteUserInput, UpdateUserInput, User, UserList } from "./users.types";

type UsersState = {
  data: UserList | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: ApiError | null;
};

const initialState: UsersState = { data: null, status: "idle", error: null };

export const fetchUsers = createAppThunk(
  "users/fetch",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      return await usersApi.listUsers();
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while one is already in flight.
    condition: (_arg, { getState }) => getState().users.status !== "loading",
  },
);

// The thunks below are mutations: a dialog dispatches one, awaits `.unwrap()` and shows the
// rejection itself, so they do not touch `status` or `error`. Those that change a user put the
// returned user in the list at once, then reload the list, because one change can show on other
// rows too (a manager's name or status appears on each of their reps).
export const inviteUser = createAppThunk(
  "users/invite",
  async (input: InviteUserInput, { dispatch, rejectWithValue }) => {
    try {
      const result = await usersApi.inviteUser(input);
      void dispatch(fetchUsers());
      return result;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const updateUser = createAppThunk(
  "users/update",
  async (arg: { id: string; changes: UpdateUserInput }, { dispatch, rejectWithValue }) => {
    try {
      const result = await usersApi.updateUser(arg.id, arg.changes);
      void dispatch(fetchUsers());
      return result;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const deactivateUser = createAppThunk(
  "users/deactivate",
  async (id: string, { dispatch, rejectWithValue }) => {
    try {
      const user = await usersApi.deactivateUser(id);
      void dispatch(fetchUsers());
      return { user };
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const reactivateUser = createAppThunk(
  "users/reactivate",
  async (id: string, { dispatch, rejectWithValue }) => {
    try {
      const user = await usersApi.reactivateUser(id);
      void dispatch(fetchUsers());
      return { user };
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const resendInvite = createAppThunk(
  "users/resendInvite",
  async (id: string, { rejectWithValue }) => {
    try {
      return await usersApi.resendInvite(id);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const createPasswordResetLink = createAppThunk(
  "users/createPasswordResetLink",
  async (id: string, { rejectWithValue }) => {
    try {
      return await usersApi.createPasswordResetLink(id);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

// Replaces the user with the same id, or adds a new one at the end.
function putUser(users: User[], user: User): void {
  const index = users.findIndex((existing) => existing.id === user.id);
  if (index === -1) {
    users.push(user);
  } else {
    users[index] = user;
  }
}

const usersSlice = createSlice({
  name: "users",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.data = action.payload;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload ?? {
          code: "UNKNOWN_ERROR",
          message: action.error.message ?? "Unexpected error",
          details: null,
        };
      })
      .addMatcher(
        isAnyOf(
          inviteUser.fulfilled,
          updateUser.fulfilled,
          deactivateUser.fulfilled,
          reactivateUser.fulfilled,
        ),
        (state, action) => {
          if (state.data) {
            putUser(state.data.users, action.payload.user);
          }
        },
      );
  },
});

export const usersReducer = usersSlice.reducer;

export const selectUsers = (state: RootState) => state.users;
