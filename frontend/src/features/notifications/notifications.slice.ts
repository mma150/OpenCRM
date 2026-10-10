import { createSlice } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as notificationsApi from "./notifications.api";
import type { NotificationList } from "./notifications.types";

type Status = "idle" | "loading" | "succeeded" | "failed";

export const NOTIFICATIONS_PAGE_SIZE = 20;

// The slice loads two things, so it holds the usual three keys twice:
//   unread: how many notifications the user has not read (the number on the bell)
//   list:   the notifications themselves, newest first, with `more` for "Load more",
//           which adds a page and must not turn the list back into a loading state
type NotificationsState = {
  unread: { data: number | null; status: Status; error: ApiError | null };
  list: {
    data: NotificationList | null;
    status: Status;
    error: ApiError | null;
    more: { status: "idle" | "loading" | "failed"; error: ApiError | null };
  };
};

const initialState: NotificationsState = {
  unread: { data: null, status: "idle", error: null },
  list: { data: null, status: "idle", error: null, more: { status: "idle", error: null } },
};

function unknownError(message: string | undefined): ApiError {
  return { code: "UNKNOWN_ERROR", message: message ?? "Unexpected error", details: null };
}

// Loads the first page of the list, replacing what was there.
export const fetchNotifications = createAppThunk(
  "notifications/fetch",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      return await notificationsApi.listNotifications({
        page: 1,
        pageSize: NOTIFICATIONS_PAGE_SIZE,
      });
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while one is already in flight.
    condition: (_arg, { getState }) => getState().notifications.list.status !== "loading",
  },
);

// "Load more": the page after the last one loaded, added to the end of the list.
export const fetchMoreNotifications = createAppThunk(
  "notifications/fetchMore",
  async (_arg: undefined, { getState, rejectWithValue }) => {
    try {
      const page = (getState().notifications.list.data?.page ?? 0) + 1;
      return await notificationsApi.listNotifications({ page, pageSize: NOTIFICATIONS_PAGE_SIZE });
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    condition: (_arg, { getState }) => {
      const { data, status, more } = getState().notifications.list;
      return (
        status === "succeeded" &&
        more.status !== "loading" &&
        data !== null &&
        data.notifications.length < data.total
      );
    },
  },
);

// The number on the bell. The bell asks again every minute; when the number has gone up and
// the list is loaded, the list is loaded again too, so the new notification shows in it.
export const fetchUnreadCount = createAppThunk(
  "notifications/fetchUnreadCount",
  async (_arg: undefined, { dispatch, getState, rejectWithValue }) => {
    try {
      const before = getState().notifications.unread.data;
      const count = await notificationsApi.getUnreadCount();
      if (before !== null && count > before && getState().notifications.list.data) {
        void dispatch(fetchNotifications());
      }
      return count;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    condition: (_arg, { getState }) => getState().notifications.unread.status !== "loading",
  },
);

// The two thunks below are mutations: the caller awaits `.unwrap()` and shows the rejection
// itself, so they do not touch `status` or `error`.
export const markNotificationRead = createAppThunk(
  "notifications/markRead",
  async (id: string, { rejectWithValue }) => {
    try {
      return await notificationsApi.markNotificationRead(id);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const markAllNotificationsRead = createAppThunk(
  "notifications/markAllRead",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      await notificationsApi.markAllNotificationsRead();
      // The moment the loaded notifications are shown as read from.
      return new Date().toISOString();
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

const notificationsSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.list.status = "loading";
        state.list.error = null;
        state.list.more = initialState.list.more;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.list.status = "succeeded";
        state.list.data = action.payload;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.list.status = "failed";
        state.list.error = action.payload ?? unknownError(action.error.message);
      })
      .addCase(fetchMoreNotifications.pending, (state) => {
        state.list.more = { status: "loading", error: null };
      })
      .addCase(fetchMoreNotifications.fulfilled, (state, action) => {
        if (!state.list.data) {
          return;
        }
        // A notification that arrived since the first page was loaded moves every later one
        // down by one, so the next page can start with one that is already here.
        const loaded = new Set(state.list.data.notifications.map((item) => item.id));
        const { notifications, ...meta } = action.payload;
        state.list.data = {
          ...meta,
          notifications: [
            ...state.list.data.notifications,
            ...notifications.filter((item) => !loaded.has(item.id)),
          ],
        };
        state.list.more = initialState.list.more;
      })
      .addCase(fetchMoreNotifications.rejected, (state, action) => {
        state.list.more = {
          status: "failed",
          error: action.payload ?? unknownError(action.error.message),
        };
      })
      .addCase(fetchUnreadCount.pending, (state) => {
        state.unread.status = "loading";
        state.unread.error = null;
      })
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.unread.status = "succeeded";
        state.unread.data = action.payload;
      })
      .addCase(fetchUnreadCount.rejected, (state, action) => {
        state.unread.status = "failed";
        state.unread.error = action.payload ?? unknownError(action.error.message);
      })
      .addCase(markNotificationRead.fulfilled, (state, action) => {
        const items = state.list.data?.notifications ?? [];
        const index = items.findIndex((item) => item.id === action.payload.id);
        const known = items[index];
        // The bell goes down by one, unless the list says this one had been read already.
        if (state.unread.data && !known?.readAt) {
          state.unread.data -= 1;
        }
        if (known) {
          items[index] = action.payload;
        }
      })
      .addCase(markAllNotificationsRead.fulfilled, (state, action) => {
        state.unread.data = 0;
        for (const item of state.list.data?.notifications ?? []) {
          item.readAt ??= action.payload;
        }
      });
  },
});

export const notificationsReducer = notificationsSlice.reducer;

export const selectNotificationList = (state: RootState) => state.notifications.list;
export const selectUnreadCount = (state: RootState) => state.notifications.unread;
