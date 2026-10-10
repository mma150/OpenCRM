import { createSlice, isAnyOf } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as stagesApi from "./pipeline-stages.api";
import type { PipelineStage } from "./pipeline-stages.types";

// The pipeline in order (open stages, Won, Lost), for the board, every stage picker and the
// settings page.
type PipelineStagesState = {
  data: PipelineStage[] | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: ApiError | null;
};

const initialState: PipelineStagesState = { data: null, status: "idle", error: null };

export const fetchPipelineStages = createAppThunk(
  "pipelineStages/fetch",
  async (_arg: undefined, { rejectWithValue }) => {
    try {
      return await stagesApi.listPipelineStages();
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while one is already in flight.
    condition: (_arg, { getState }) => getState().pipelineStages.status !== "loading",
  },
);

// The thunks below are mutations (Admin only): a dialog dispatches one, awaits `.unwrap()`
// and shows the rejection itself, so they do not touch `status` or `error`. Each answers
// with the whole pipeline, which replaces `data`.
export const createPipelineStage = createAppThunk(
  "pipelineStages/create",
  async (name: string, { rejectWithValue }) => {
    try {
      return await stagesApi.createPipelineStage(name);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const renamePipelineStage = createAppThunk(
  "pipelineStages/rename",
  async (arg: { id: string; name: string }, { rejectWithValue }) => {
    try {
      return await stagesApi.renamePipelineStage(arg.id, arg.name);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const reorderPipelineStages = createAppThunk(
  "pipelineStages/reorder",
  async (ids: string[], { rejectWithValue }) => {
    try {
      return await stagesApi.reorderPipelineStages(ids);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const deletePipelineStage = createAppThunk(
  "pipelineStages/delete",
  async (arg: { id: string; moveToStageId?: string }, { rejectWithValue }) => {
    try {
      return await stagesApi.deletePipelineStage(arg.id, arg.moveToStageId);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

const pipelineStagesSlice = createSlice({
  name: "pipelineStages",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPipelineStages.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchPipelineStages.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload ?? {
          code: "UNKNOWN_ERROR",
          message: action.error.message ?? "Unexpected error",
          details: null,
        };
      })
      .addMatcher(
        isAnyOf(
          fetchPipelineStages.fulfilled,
          createPipelineStage.fulfilled,
          renamePipelineStage.fulfilled,
          reorderPipelineStages.fulfilled,
          deletePipelineStage.fulfilled,
        ),
        (state, action) => {
          state.status = "succeeded";
          state.error = null;
          state.data = action.payload;
        },
      );
  },
});

export const pipelineStagesReducer = pipelineStagesSlice.reducer;

export const selectPipelineStages = (state: RootState) => state.pipelineStages;
