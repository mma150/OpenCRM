import { createSlice, isAnyOf } from "@reduxjs/toolkit";

import { logConversation } from "@/features/timeline/timeline.slice";
import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as contactsApi from "./contacts.api";
import type {
  Contact,
  ContactList,
  ContactListQuery,
  CreateContactInput,
  UpdateContactInput,
} from "./contacts.types";

type Status = "idle" | "loading" | "succeeded" | "failed";

// The slice loads two things, so it holds the usual three keys twice:
//   list:    one page of contacts, with the `query` (search, filters, sort, page) it was asked for
//   current: the contact open on the detail or edit page, with the `id` it was asked for
type ContactsState = {
  list: {
    data: ContactList | null;
    status: Status;
    error: ApiError | null;
    query: ContactListQuery | null;
  };
  current: { data: Contact | null; status: Status; error: ApiError | null; id: string | null };
};

const initialState: ContactsState = {
  list: { data: null, status: "idle", error: null, query: null },
  current: { data: null, status: "idle", error: null, id: null },
};

function sameQuery(a: ContactListQuery, b: ContactListQuery | null): boolean {
  if (!b) {
    return false;
  }
  const keys = Object.keys({ ...a, ...b }) as (keyof ContactListQuery)[];
  return keys.every((key) => a[key] === b[key]);
}

function unknownError(message: string | undefined): ApiError {
  return { code: "UNKNOWN_ERROR", message: message ?? "Unexpected error", details: null };
}

export const fetchContacts = createAppThunk(
  "contacts/fetch",
  async (query: ContactListQuery, { rejectWithValue }) => {
    try {
      return await contactsApi.listContacts(query);
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while the same one is already in flight. A different query (the user
    // typed on, or changed a filter) is let through, and the older answer is then ignored.
    condition: (query, { getState }) => {
      const { list } = getState().contacts;
      return !(list.status === "loading" && sameQuery(query, list.query));
    },
  },
);

export const fetchContact = createAppThunk(
  "contacts/fetchOne",
  async (id: string, { rejectWithValue }) => {
    try {
      return await contactsApi.getContact(id);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    condition: (id, { getState }) => {
      const { current } = getState().contacts;
      return !(current.status === "loading" && current.id === id);
    },
  },
);

// Reloads the list with the query it was last loaded with, so a change shows where it
// belongs under the current filters and sort.
function reloadList(api: {
  dispatch: (action: ReturnType<typeof fetchContacts>) => unknown;
  getState: () => RootState;
}): void {
  const { query } = api.getState().contacts.list;
  if (query) {
    void api.dispatch(fetchContacts(query));
  }
}

// The thunks below are mutations: a form or dialog dispatches one, awaits `.unwrap()` and
// shows the rejection itself, so they do not touch `status` or `error`. The returned contact
// is put in the list and in `current` at once, and the list is then reloaded.
export const createContact = createAppThunk(
  "contacts/create",
  async (input: CreateContactInput, { dispatch, getState, rejectWithValue }) => {
    try {
      const contact = await contactsApi.createContact(input);
      reloadList({ dispatch, getState });
      return contact;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const updateContact = createAppThunk(
  "contacts/update",
  async (
    arg: { id: string; changes: UpdateContactInput },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const contact = await contactsApi.updateContact(arg.id, arg.changes);
      reloadList({ dispatch, getState });
      return contact;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const assignContact = createAppThunk(
  "contacts/assign",
  async (arg: { id: string; ownerId: string }, { dispatch, getState, rejectWithValue }) => {
    try {
      const contact = await contactsApi.assignContact(arg.id, arg.ownerId);
      reloadList({ dispatch, getState });
      return contact;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const deleteContact = createAppThunk(
  "contacts/delete",
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    try {
      await contactsApi.deleteContact(id);
      reloadList({ dispatch, getState });
      return id;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

const contactsSlice = createSlice({
  name: "contacts",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchContacts.pending, (state, action) => {
        state.list.status = "loading";
        state.list.error = null;
        state.list.query = action.meta.arg;
      })
      .addCase(fetchContacts.fulfilled, (state, action) => {
        // An answer to an older query is dropped: a newer request is on its way.
        if (sameQuery(action.meta.arg, state.list.query)) {
          state.list.status = "succeeded";
          state.list.data = action.payload;
        }
      })
      .addCase(fetchContacts.rejected, (state, action) => {
        if (sameQuery(action.meta.arg, state.list.query)) {
          state.list.status = "failed";
          state.list.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addCase(fetchContact.pending, (state, action) => {
        // Never show one contact under another contact's address.
        if (state.current.id !== action.meta.arg) {
          state.current.data = null;
        }
        state.current.id = action.meta.arg;
        state.current.status = "loading";
        state.current.error = null;
      })
      .addCase(fetchContact.fulfilled, (state, action) => {
        if (state.current.id === action.meta.arg) {
          state.current.status = "succeeded";
          state.current.data = action.payload;
        }
      })
      .addCase(fetchContact.rejected, (state, action) => {
        if (state.current.id === action.meta.arg) {
          state.current.status = "failed";
          state.current.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addCase(deleteContact.fulfilled, (state, action) => {
        if (state.list.data) {
          state.list.data.contacts = state.list.data.contacts.filter(
            (contact) => contact.id !== action.payload,
          );
        }
        if (state.current.id === action.payload) {
          state.current = initialState.current;
        }
      })
      // A conversation logged on the open contact moves its "Last contact" forward, as the
      // API does, without loading the contact again.
      .addCase(logConversation.fulfilled, (state, action) => {
        const { record } = action.meta.arg;
        const contact = state.current.data;
        if (!contact || record.type !== "contact" || contact.id !== record.id) {
          return;
        }
        const { occurredAt } = action.payload;
        if (contact.lastContactAt === null || contact.lastContactAt < occurredAt) {
          contact.lastContactAt = occurredAt;
        }
      })
      .addMatcher(isAnyOf(updateContact.fulfilled, assignContact.fulfilled), (state, action) => {
        const contact = action.payload;
        const index = state.list.data?.contacts.findIndex((existing) => existing.id === contact.id);
        if (state.list.data && index !== undefined && index !== -1) {
          state.list.data.contacts[index] = contact;
        }
        if (state.current.id === contact.id) {
          state.current.data = contact;
        }
      });
  },
});

export const contactsReducer = contactsSlice.reducer;

export const selectContactList = (state: RootState) => state.contacts.list;
export const selectCurrentContact = (state: RootState) => state.contacts.current;
