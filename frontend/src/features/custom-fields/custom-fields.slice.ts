import { createSlice, isAnyOf } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as customFieldsApi from "./custom-fields.api";
import type {
  CreateCustomFieldInput,
  CustomField,
  CustomFieldRecordType,
  UpdateCustomFieldInput,
} from "./custom-fields.types";

type Status = "idle" | "loading" | "succeeded" | "failed";
type Loaded = { data: CustomField[] | null; status: Status; error: ApiError | null };

// The slice loads two things, so it holds the usual three keys more than once:
//   fields:   the fields in use of each record type, in order. Forms, record pages and list
//             filters read them; every signed-in user may.
//   settings: every field of the record type open on the settings page, the archived ones
//             last (Admin only), with the `recordType` it was asked for.
type CustomFieldsState = {
  fields: Record<CustomFieldRecordType, Loaded>;
  settings: Loaded & { recordType: CustomFieldRecordType | null };
};

const empty: Loaded = { data: null, status: "idle", error: null };

const initialState: CustomFieldsState = {
  fields: { LEAD: empty, CONTACT: empty, COMPANY: empty, OPPORTUNITY: empty },
  settings: { ...empty, recordType: null },
};

function unknownError(message: string | undefined): ApiError {
  return { code: "UNKNOWN_ERROR", message: message ?? "Unexpected error", details: null };
}

export const fetchCustomFields = createAppThunk(
  "customFields/fetch",
  async (recordType: CustomFieldRecordType, { rejectWithValue }) => {
    try {
      return await customFieldsApi.listCustomFields(recordType);
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while one for the same record type is already in flight.
    condition: (recordType, { getState }) =>
      getState().customFields.fields[recordType].status !== "loading",
  },
);

export const fetchCustomFieldSettings = createAppThunk(
  "customFields/fetchSettings",
  async (recordType: CustomFieldRecordType, { rejectWithValue }) => {
    try {
      return await customFieldsApi.listAllCustomFields(recordType);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Another record type (the Admin changed tab) is let through, and the older answer is
    // then ignored.
    condition: (recordType, { getState }) => {
      const { settings } = getState().customFields;
      return !(settings.status === "loading" && settings.recordType === recordType);
    },
  },
);

// The thunks below are mutations (Admin only): a dialog dispatches one, awaits `.unwrap()`
// and shows the rejection itself, so they do not touch `status` or `error`. The field the
// API answers with is put in its place in the settings list at once.
export const createCustomField = createAppThunk(
  "customFields/create",
  async (input: CreateCustomFieldInput, { rejectWithValue }) => {
    try {
      return await customFieldsApi.createCustomField(input);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const updateCustomField = createAppThunk(
  "customFields/update",
  async (arg: { id: string; changes: UpdateCustomFieldInput }, { rejectWithValue }) => {
    try {
      return await customFieldsApi.updateCustomField(arg.id, arg.changes);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const reorderCustomFields = createAppThunk(
  "customFields/reorder",
  async (arg: { recordType: CustomFieldRecordType; ids: string[] }, { rejectWithValue }) => {
    try {
      return await customFieldsApi.reorderCustomFields(arg.recordType, arg.ids);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const archiveCustomField = createAppThunk(
  "customFields/archive",
  async (id: string, { rejectWithValue }) => {
    try {
      return await customFieldsApi.archiveCustomField(id);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const restoreCustomField = createAppThunk(
  "customFields/restore",
  async (id: string, { rejectWithValue }) => {
    try {
      return await customFieldsApi.restoreCustomField(id);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const deleteCustomField = createAppThunk(
  "customFields/delete",
  async (field: CustomField, { rejectWithValue }) => {
    try {
      await customFieldsApi.deleteCustomField(field.id);
      return field;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

// The fields in use first, in order, then the archived ones: the order the API lists them in.
function inOrder(fields: CustomField[]): CustomField[] {
  return [
    ...fields.filter((field) => !field.archived),
    ...fields.filter((field) => field.archived),
  ];
}

// Puts a changed field into the settings list. One that stayed where it was (a new label)
// keeps its place; a new, archived or restored one goes last in its group, as in the API.
function withField(fields: CustomField[], changed: CustomField): CustomField[] {
  const index = fields.findIndex((field) => field.id === changed.id);
  const before = fields[index];
  if (before?.archived === changed.archived) {
    return fields.map((field) => (field.id === changed.id ? changed : field));
  }
  return inOrder([...fields.filter((field) => field.id !== changed.id), changed]);
}

// What changes on the settings page shows in every form and filter at once: the fields in
// use of that record type are the settings list without the archived ones.
function publish(state: CustomFieldsState): void {
  const { recordType, data } = state.settings;
  if (recordType && data) {
    state.fields[recordType] = {
      data: data.filter((field) => !field.archived),
      status: "succeeded",
      error: null,
    };
  }
}

const customFieldsSlice = createSlice({
  name: "customFields",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCustomFields.pending, (state, action) => {
        const fields = state.fields[action.meta.arg];
        fields.status = "loading";
        fields.error = null;
      })
      .addCase(fetchCustomFields.fulfilled, (state, action) => {
        const fields = state.fields[action.meta.arg];
        fields.status = "succeeded";
        fields.data = action.payload;
      })
      .addCase(fetchCustomFields.rejected, (state, action) => {
        const fields = state.fields[action.meta.arg];
        fields.status = "failed";
        fields.error = action.payload ?? unknownError(action.error.message);
      })
      .addCase(fetchCustomFieldSettings.pending, (state, action) => {
        // Never show one record type's fields under another's tab.
        if (state.settings.recordType !== action.meta.arg) {
          state.settings.data = null;
        }
        state.settings.recordType = action.meta.arg;
        state.settings.status = "loading";
        state.settings.error = null;
      })
      .addCase(fetchCustomFieldSettings.fulfilled, (state, action) => {
        if (state.settings.recordType === action.meta.arg) {
          state.settings.status = "succeeded";
          state.settings.data = action.payload;
          publish(state);
        }
      })
      .addCase(fetchCustomFieldSettings.rejected, (state, action) => {
        if (state.settings.recordType === action.meta.arg) {
          state.settings.status = "failed";
          state.settings.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addCase(reorderCustomFields.fulfilled, (state, action) => {
        if (state.settings.recordType === action.meta.arg.recordType) {
          state.settings.data = action.payload;
          publish(state);
        }
      })
      .addCase(deleteCustomField.fulfilled, (state, action) => {
        if (state.settings.recordType === action.payload.recordType && state.settings.data) {
          state.settings.data = state.settings.data.filter(
            (field) => field.id !== action.payload.id,
          );
        }
      })
      .addMatcher(
        isAnyOf(
          createCustomField.fulfilled,
          updateCustomField.fulfilled,
          archiveCustomField.fulfilled,
          restoreCustomField.fulfilled,
        ),
        (state, action) => {
          if (state.settings.recordType === action.payload.recordType && state.settings.data) {
            state.settings.data = withField(state.settings.data, action.payload);
            publish(state);
          }
        },
      );
  },
});

export const customFieldsReducer = customFieldsSlice.reducer;

// The fields in use of one record type: `useAppSelector(selectCustomFields("LEAD"))`.
export const selectCustomFields = (recordType: CustomFieldRecordType) => (state: RootState) =>
  state.customFields.fields[recordType];
export const selectCustomFieldSettings = (state: RootState) => state.customFields.settings;
