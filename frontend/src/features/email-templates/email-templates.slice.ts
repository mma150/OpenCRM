import { createSlice } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as emailTemplatesApi from "./email-templates.api";
import type {
  CreateEmailTemplateInput,
  EmailPlaceholder,
  EmailTemplate,
  UpdateEmailTemplateInput,
} from "./email-templates.types";

type Loaded<T> = {
  data: T | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: ApiError | null;
};

// The slice loads two things, so it holds the usual three keys twice:
//   list:         the signed-in user's own templates and every shared one, by name. The
//                 settings page and the template picker of the composer read it.
//   placeholders: the {{placeholders}} the API fills in when an email is sent.
type EmailTemplatesState = {
  list: Loaded<EmailTemplate[]>;
  placeholders: Loaded<EmailPlaceholder[]>;
};

const initialState: EmailTemplatesState = {
  list: { data: null, status: "idle", error: null },
  placeholders: { data: null, status: "idle", error: null },
};

function unknownError(message: string | undefined): ApiError {
  return { code: "UNKNOWN_ERROR", message: message ?? "Unexpected error", details: null };
}

// The API lists templates by name, whatever the case; a saved one goes where it belongs.
function byName(templates: EmailTemplate[]): EmailTemplate[] {
  return [...templates].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export const fetchEmailTemplates = createAppThunk(
  "emailTemplates/fetch",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      return await emailTemplatesApi.listEmailTemplates();
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while one is already in flight.
    condition: (_arg, { getState }) => getState().emailTemplates.list.status !== "loading",
  },
);

export const fetchEmailPlaceholders = createAppThunk(
  "emailTemplates/fetchPlaceholders",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      return await emailTemplatesApi.listEmailPlaceholders();
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // The placeholders are the same for everyone and only change with the API, so they are
    // asked for once: not while a request is running, and not again once they are here.
    condition: (_arg, { getState }) => {
      const { status } = getState().emailTemplates.placeholders;
      return status !== "loading" && status !== "succeeded";
    },
  },
);

// The three thunks below are mutations: a dialog dispatches one, awaits `.unwrap()` and
// shows the rejection itself, so they do not touch `status` or `error`. The list follows
// the answer at once.
export const createEmailTemplate = createAppThunk(
  "emailTemplates/create",
  async (input: CreateEmailTemplateInput, { rejectWithValue }) => {
    try {
      return await emailTemplatesApi.createEmailTemplate(input);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const updateEmailTemplate = createAppThunk(
  "emailTemplates/update",
  async (arg: { id: string; changes: UpdateEmailTemplateInput }, { rejectWithValue }) => {
    try {
      return await emailTemplatesApi.updateEmailTemplate(arg.id, arg.changes);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const deleteEmailTemplate = createAppThunk(
  "emailTemplates/delete",
  async (id: string, { rejectWithValue }) => {
    try {
      await emailTemplatesApi.deleteEmailTemplate(id);
      return id;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

const emailTemplatesSlice = createSlice({
  name: "emailTemplates",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEmailTemplates.pending, (state) => {
        state.list.status = "loading";
        state.list.error = null;
      })
      .addCase(fetchEmailTemplates.fulfilled, (state, action) => {
        state.list.status = "succeeded";
        state.list.data = action.payload;
      })
      .addCase(fetchEmailTemplates.rejected, (state, action) => {
        state.list.status = "failed";
        state.list.error = action.payload ?? unknownError(action.error.message);
      })
      .addCase(fetchEmailPlaceholders.pending, (state) => {
        state.placeholders.status = "loading";
        state.placeholders.error = null;
      })
      .addCase(fetchEmailPlaceholders.fulfilled, (state, action) => {
        state.placeholders.status = "succeeded";
        state.placeholders.data = action.payload;
      })
      .addCase(fetchEmailPlaceholders.rejected, (state, action) => {
        state.placeholders.status = "failed";
        state.placeholders.error = action.payload ?? unknownError(action.error.message);
      })
      .addCase(createEmailTemplate.fulfilled, (state, action) => {
        if (state.list.data) {
          state.list.data = byName([...state.list.data, action.payload]);
        }
      })
      .addCase(updateEmailTemplate.fulfilled, (state, action) => {
        if (state.list.data) {
          const template = action.payload;
          state.list.data = byName(
            state.list.data.map((existing) => (existing.id === template.id ? template : existing)),
          );
        }
      })
      .addCase(deleteEmailTemplate.fulfilled, (state, action) => {
        if (state.list.data) {
          state.list.data = state.list.data.filter((template) => template.id !== action.payload);
        }
      });
  },
});

export const emailTemplatesReducer = emailTemplatesSlice.reducer;

export const selectEmailTemplates = (state: RootState) => state.emailTemplates.list;
export const selectEmailPlaceholders = (state: RootState) => state.emailTemplates.placeholders;
