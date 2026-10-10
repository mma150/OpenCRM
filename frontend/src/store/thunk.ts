import { createAsyncThunk } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";

import type { RootState } from "./index";

// createAsyncThunk with this app's types: every rejection carries an ApiError.
export const createAppThunk = createAsyncThunk.withTypes<{
  state: RootState;
  rejectValue: ApiError;
}>();
