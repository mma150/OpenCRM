import { createSlice, isAnyOf } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as companiesApi from "./companies.api";
import type {
  Company,
  CompanyList,
  CompanyListQuery,
  CreateCompanyInput,
  UpdateCompanyInput,
} from "./companies.types";

type Status = "idle" | "loading" | "succeeded" | "failed";

// The slice loads three things, so it holds the usual three keys three times:
//   list:       one page of companies, with the `query` (search, filters, sort, page) it was asked for
//   current:    the company open on the detail or edit page, with the `id` it was asked for
//   industries: the industries in use, for the Industry filter and the form's suggestions
type CompaniesState = {
  list: {
    data: CompanyList | null;
    status: Status;
    error: ApiError | null;
    query: CompanyListQuery | null;
  };
  current: { data: Company | null; status: Status; error: ApiError | null; id: string | null };
  industries: { data: string[] | null; status: Status; error: ApiError | null };
};

const initialState: CompaniesState = {
  list: { data: null, status: "idle", error: null, query: null },
  current: { data: null, status: "idle", error: null, id: null },
  industries: { data: null, status: "idle", error: null },
};

function sameQuery(a: CompanyListQuery, b: CompanyListQuery | null): boolean {
  if (!b) {
    return false;
  }
  const keys = Object.keys({ ...a, ...b }) as (keyof CompanyListQuery)[];
  return keys.every((key) => a[key] === b[key]);
}

function unknownError(message: string | undefined): ApiError {
  return { code: "UNKNOWN_ERROR", message: message ?? "Unexpected error", details: null };
}

export const fetchCompanies = createAppThunk(
  "companies/fetch",
  async (query: CompanyListQuery, { rejectWithValue }) => {
    try {
      return await companiesApi.listCompanies(query);
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while the same one is already in flight. A different query (the user
    // typed on, or changed a filter) is let through, and the older answer is then ignored.
    condition: (query, { getState }) => {
      const { list } = getState().companies;
      return !(list.status === "loading" && sameQuery(query, list.query));
    },
  },
);

export const fetchCompany = createAppThunk(
  "companies/fetchOne",
  async (id: string, { rejectWithValue }) => {
    try {
      return await companiesApi.getCompany(id);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    condition: (id, { getState }) => {
      const { current } = getState().companies;
      return !(current.status === "loading" && current.id === id);
    },
  },
);

export const fetchIndustries = createAppThunk(
  "companies/fetchIndustries",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      return await companiesApi.listIndustries();
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    condition: (_arg, { getState }) => getState().companies.industries.status !== "loading",
  },
);

// Reloads the list with the query it was last loaded with, so a change shows where it
// belongs under the current filters and sort. The industries are loaded again with it: a
// new, renamed or deleted company can add or remove one.
function reloadList(api: {
  dispatch: (
    action: ReturnType<typeof fetchCompanies> | ReturnType<typeof fetchIndustries>,
  ) => unknown;
  getState: () => RootState;
}): void {
  const { list, industries } = api.getState().companies;
  if (list.query) {
    void api.dispatch(fetchCompanies(list.query));
  }
  if (industries.data) {
    void api.dispatch(fetchIndustries());
  }
}

// The thunks below are mutations: a form or dialog dispatches one, awaits `.unwrap()` and
// shows the rejection itself, so they do not touch `status` or `error`. The returned company
// is put in the list and in `current` at once, and the list is then reloaded.
export const createCompany = createAppThunk(
  "companies/create",
  async (input: CreateCompanyInput, { dispatch, getState, rejectWithValue }) => {
    try {
      const company = await companiesApi.createCompany(input);
      reloadList({ dispatch, getState });
      return company;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const updateCompany = createAppThunk(
  "companies/update",
  async (
    arg: { id: string; changes: UpdateCompanyInput },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const company = await companiesApi.updateCompany(arg.id, arg.changes);
      reloadList({ dispatch, getState });
      return company;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const assignCompany = createAppThunk(
  "companies/assign",
  async (arg: { id: string; ownerId: string }, { dispatch, getState, rejectWithValue }) => {
    try {
      const company = await companiesApi.assignCompany(arg.id, arg.ownerId);
      reloadList({ dispatch, getState });
      return company;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const deleteCompany = createAppThunk(
  "companies/delete",
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    try {
      await companiesApi.deleteCompany(id);
      reloadList({ dispatch, getState });
      return id;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

const companiesSlice = createSlice({
  name: "companies",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCompanies.pending, (state, action) => {
        state.list.status = "loading";
        state.list.error = null;
        state.list.query = action.meta.arg;
      })
      .addCase(fetchCompanies.fulfilled, (state, action) => {
        // An answer to an older query is dropped: a newer request is on its way.
        if (sameQuery(action.meta.arg, state.list.query)) {
          state.list.status = "succeeded";
          state.list.data = action.payload;
        }
      })
      .addCase(fetchCompanies.rejected, (state, action) => {
        if (sameQuery(action.meta.arg, state.list.query)) {
          state.list.status = "failed";
          state.list.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addCase(fetchCompany.pending, (state, action) => {
        // Never show one company under another company's address.
        if (state.current.id !== action.meta.arg) {
          state.current.data = null;
        }
        state.current.id = action.meta.arg;
        state.current.status = "loading";
        state.current.error = null;
      })
      .addCase(fetchCompany.fulfilled, (state, action) => {
        if (state.current.id === action.meta.arg) {
          state.current.status = "succeeded";
          state.current.data = action.payload;
        }
      })
      .addCase(fetchCompany.rejected, (state, action) => {
        if (state.current.id === action.meta.arg) {
          state.current.status = "failed";
          state.current.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addCase(fetchIndustries.pending, (state) => {
        state.industries.status = "loading";
        state.industries.error = null;
      })
      .addCase(fetchIndustries.fulfilled, (state, action) => {
        state.industries.status = "succeeded";
        state.industries.data = action.payload;
      })
      .addCase(fetchIndustries.rejected, (state, action) => {
        state.industries.status = "failed";
        state.industries.error = action.payload ?? unknownError(action.error.message);
      })
      .addCase(deleteCompany.fulfilled, (state, action) => {
        if (state.list.data) {
          state.list.data.companies = state.list.data.companies.filter(
            (company) => company.id !== action.payload,
          );
        }
        if (state.current.id === action.payload) {
          state.current = initialState.current;
        }
      })
      .addMatcher(isAnyOf(updateCompany.fulfilled, assignCompany.fulfilled), (state, action) => {
        const company = action.payload;
        const index = state.list.data?.companies.findIndex(
          (existing) => existing.id === company.id,
        );
        if (state.list.data && index !== undefined && index !== -1) {
          state.list.data.companies[index] = company;
        }
        if (state.current.id === company.id) {
          state.current.data = company;
        }
      });
  },
});

export const companiesReducer = companiesSlice.reducer;

export const selectCompanyList = (state: RootState) => state.companies.list;
export const selectCurrentCompany = (state: RootState) => state.companies.current;
export const selectIndustries = (state: RootState) => state.companies.industries;
