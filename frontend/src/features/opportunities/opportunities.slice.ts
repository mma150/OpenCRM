import { createSlice, isAnyOf, type PayloadAction } from "@reduxjs/toolkit";

import { logConversation, sendEmail } from "@/features/timeline/timeline.slice";
import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import * as opportunitiesApi from "./opportunities.api";
import type {
  BoardColumn,
  BoardQuery,
  CloseOpportunityInput,
  CreateOpportunityInput,
  FollowUpInput,
  Opportunity,
  OpportunityList,
  OpportunityListQuery,
  UpdateOpportunityInput,
} from "./opportunities.types";

type Status = "idle" | "loading" | "succeeded" | "failed";

// The slice loads three things, so it holds the usual three keys three times:
//   list:    one page of opportunities, with the `query` (search, filters, sort, page) it was asked for
//   board:   the pipeline as columns, with the `query` (search, owner) it was asked for
//   current: the opportunity open on the detail or edit page, with the `id` it was asked for
type OpportunitiesState = {
  list: {
    data: OpportunityList | null;
    status: Status;
    error: ApiError | null;
    query: OpportunityListQuery | null;
  };
  board: {
    data: BoardColumn[] | null;
    status: Status;
    error: ApiError | null;
    query: BoardQuery | null;
  };
  current: { data: Opportunity | null; status: Status; error: ApiError | null; id: string | null };
};

const initialState: OpportunitiesState = {
  list: { data: null, status: "idle", error: null, query: null },
  board: { data: null, status: "idle", error: null, query: null },
  current: { data: null, status: "idle", error: null, id: null },
};

function sameQuery<Query extends object>(a: Query, b: Query | null): boolean {
  if (!b) {
    return false;
  }
  const keys = Object.keys({ ...a, ...b }) as (keyof Query)[];
  return keys.every((key) => a[key] === b[key]);
}

function unknownError(message: string | undefined): ApiError {
  return { code: "UNKNOWN_ERROR", message: message ?? "Unexpected error", details: null };
}

// Money is added and taken away in cents, so a column's total never picks up a rounding tail.
function addMoney(total: number, amount: number): number {
  return Math.round((total + amount) * 100) / 100;
}

// Where a card is on the board: its column and its place in it. Null when the board does
// not show it (it is not loaded, the card is filtered out, or it is past a column's 50).
export function findOnBoard(
  board: BoardColumn[] | null,
  id: string,
): { stageId: string; index: number } | null {
  for (const column of board ?? []) {
    const index = column.opportunities.findIndex((card) => card.id === id);
    if (index !== -1) {
      return { stageId: column.stage.id, index };
    }
  }
  return null;
}

// Takes a card off the board, with its share of the column's count and total.
function takeFromBoard(board: BoardColumn[], id: string): Opportunity | null {
  const place = findOnBoard(board, id);
  const column = board.find((candidate) => candidate.stage.id === place?.stageId);
  if (!place || !column) {
    return null;
  }
  const [card] = column.opportunities.splice(place.index, 1);
  if (!card) {
    return null;
  }
  column.count -= 1;
  column.totalValue = addMoney(column.totalValue, -card.value);
  return card;
}

// Puts a card into the column of `stageId`, at `index` (the top unless told otherwise).
function putOnBoard(board: BoardColumn[], card: Opportunity, stageId: string, index = 0): void {
  const column = board.find((candidate) => candidate.stage.id === stageId);
  if (!column) {
    return;
  }
  const { id, name, kind } = column.stage;
  column.opportunities.splice(index, 0, { ...card, stage: { id, name, kind }, status: kind });
  column.count += 1;
  column.totalValue = addMoney(column.totalValue, card.value);
}

export const fetchOpportunities = createAppThunk(
  "opportunities/fetch",
  async (query: OpportunityListQuery, { rejectWithValue }) => {
    try {
      return await opportunitiesApi.listOpportunities(query);
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while the same one is already in flight. A different query (the user
    // typed on, or changed a filter) is let through, and the older answer is then ignored.
    condition: (query, { getState }) => {
      const { list } = getState().opportunities;
      return !(list.status === "loading" && sameQuery(query, list.query));
    },
  },
);

export const fetchBoard = createAppThunk(
  "opportunities/fetchBoard",
  async (query: BoardQuery, { rejectWithValue }) => {
    try {
      return await opportunitiesApi.getBoard(query);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    condition: (query, { getState }) => {
      const { board } = getState().opportunities;
      return !(board.status === "loading" && sameQuery(query, board.query));
    },
  },
);

export const fetchOpportunity = createAppThunk(
  "opportunities/fetchOne",
  async (id: string, { rejectWithValue }) => {
    try {
      return await opportunitiesApi.getOpportunity(id);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    condition: (id, { getState }) => {
      const { current } = getState().opportunities;
      return !(current.status === "loading" && current.id === id);
    },
  },
);

type ThunkTools = {
  dispatch: (action: ReturnType<typeof fetchOpportunities | typeof fetchBoard>) => unknown;
  getState: () => RootState;
};

// Reloads the list with the query it was last loaded with, so a change shows where it
// belongs under the current filters and sort.
function reloadList({ dispatch, getState }: ThunkTools): void {
  const { query } = getState().opportunities.list;
  if (query) {
    void dispatch(fetchOpportunities(query));
  }
}

// The same for the board: its counts and totals come from the API, so a change that is not
// a plain move between columns asks for them again.
function reloadBoard({ dispatch, getState }: ThunkTools): void {
  const { query } = getState().opportunities.board;
  if (query) {
    void dispatch(fetchBoard(query));
  }
}

// The thunks below are mutations: a form or dialog dispatches one, awaits `.unwrap()` and
// shows the rejection itself, so they do not touch `status` or `error`. The returned
// opportunity is put in the list, on the board and in `current` at once, and the list and
// the board are then reloaded.
export const createOpportunity = createAppThunk(
  "opportunities/create",
  async (input: CreateOpportunityInput, { dispatch, getState, rejectWithValue }) => {
    try {
      const opportunity = await opportunitiesApi.createOpportunity(input);
      reloadList({ dispatch, getState });
      reloadBoard({ dispatch, getState });
      return opportunity;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const updateOpportunity = createAppThunk(
  "opportunities/update",
  async (
    arg: { id: string; changes: UpdateOpportunityInput },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const opportunity = await opportunitiesApi.updateOpportunity(arg.id, arg.changes);
      reloadList({ dispatch, getState });
      reloadBoard({ dispatch, getState });
      return opportunity;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

// Moves an opportunity to another open stage. On the board the card moves at once, before
// the API has answered (an optimistic move), and goes back to where it was if the API
// refuses; the caller then shows the rejection. The API's answer replaces the card, and the
// board is not reloaded: a move changes nothing else on it.
export const moveOpportunity = createAppThunk(
  "opportunities/move",
  async (arg: { id: string; stageId: string }, { dispatch, getState, rejectWithValue }) => {
    const from = findOnBoard(getState().opportunities.board.data, arg.id);
    dispatch(cardMoved({ id: arg.id, stageId: arg.stageId }));
    try {
      const opportunity = await opportunitiesApi.moveOpportunity(arg.id, arg.stageId);
      reloadList({ dispatch, getState });
      return opportunity;
    } catch (error) {
      if (from) {
        dispatch(cardMoved({ id: arg.id, ...from }));
      }
      return rejectWithValue(error as ApiError);
    }
  },
);

export const closeOpportunity = createAppThunk(
  "opportunities/close",
  async (
    arg: { id: string; input: CloseOpportunityInput },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const opportunity = await opportunitiesApi.closeOpportunity(arg.id, arg.input);
      reloadList({ dispatch, getState });
      reloadBoard({ dispatch, getState });
      return opportunity;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const reopenOpportunity = createAppThunk(
  "opportunities/reopen",
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    try {
      const opportunity = await opportunitiesApi.reopenOpportunity(id);
      reloadList({ dispatch, getState });
      reloadBoard({ dispatch, getState });
      return opportunity;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const assignOpportunity = createAppThunk(
  "opportunities/assign",
  async (arg: { id: string; ownerId: string }, { dispatch, getState, rejectWithValue }) => {
    try {
      const opportunity = await opportunitiesApi.assignOpportunity(arg.id, arg.ownerId);
      reloadList({ dispatch, getState });
      reloadBoard({ dispatch, getState });
      return opportunity;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const setOpportunityFollowUp = createAppThunk(
  "opportunities/setFollowUp",
  async (arg: { id: string; input: FollowUpInput }, { dispatch, getState, rejectWithValue }) => {
    try {
      const opportunity = await opportunitiesApi.setOpportunityFollowUp(arg.id, arg.input);
      reloadList({ dispatch, getState });
      return opportunity;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const deleteOpportunity = createAppThunk(
  "opportunities/delete",
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    try {
      await opportunitiesApi.deleteOpportunity(id);
      reloadList({ dispatch, getState });
      reloadBoard({ dispatch, getState });
      return id;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

const opportunitiesSlice = createSlice({
  name: "opportunities",
  initialState,
  reducers: {
    // Moves a card to another column of the board, with its share of both columns' counts
    // and totals. Only `moveOpportunity` dispatches it: once to move, once more to undo.
    cardMoved: (state, action: PayloadAction<{ id: string; stageId: string; index?: number }>) => {
      const board = state.board.data;
      // A stage the board does not have: leave the card where it is.
      if (!board?.some((column) => column.stage.id === action.payload.stageId)) {
        return;
      }
      const card = takeFromBoard(board, action.payload.id);
      if (card) {
        putOnBoard(board, card, action.payload.stageId, action.payload.index);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOpportunities.pending, (state, action) => {
        state.list.status = "loading";
        state.list.error = null;
        state.list.query = action.meta.arg;
      })
      .addCase(fetchOpportunities.fulfilled, (state, action) => {
        // An answer to an older query is dropped: a newer request is on its way.
        if (sameQuery(action.meta.arg, state.list.query)) {
          state.list.status = "succeeded";
          state.list.data = action.payload;
        }
      })
      .addCase(fetchOpportunities.rejected, (state, action) => {
        if (sameQuery(action.meta.arg, state.list.query)) {
          state.list.status = "failed";
          state.list.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addCase(fetchBoard.pending, (state, action) => {
        state.board.status = "loading";
        state.board.error = null;
        state.board.query = action.meta.arg;
      })
      .addCase(fetchBoard.fulfilled, (state, action) => {
        if (sameQuery(action.meta.arg, state.board.query)) {
          state.board.status = "succeeded";
          state.board.data = action.payload;
        }
      })
      .addCase(fetchBoard.rejected, (state, action) => {
        if (sameQuery(action.meta.arg, state.board.query)) {
          state.board.status = "failed";
          state.board.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addCase(fetchOpportunity.pending, (state, action) => {
        // Never show one opportunity under another opportunity's address.
        if (state.current.id !== action.meta.arg) {
          state.current.data = null;
        }
        state.current.id = action.meta.arg;
        state.current.status = "loading";
        state.current.error = null;
      })
      .addCase(fetchOpportunity.fulfilled, (state, action) => {
        if (state.current.id === action.meta.arg) {
          state.current.status = "succeeded";
          state.current.data = action.payload;
        }
      })
      .addCase(fetchOpportunity.rejected, (state, action) => {
        if (state.current.id === action.meta.arg) {
          state.current.status = "failed";
          state.current.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addCase(deleteOpportunity.fulfilled, (state, action) => {
        if (state.list.data) {
          state.list.data.opportunities = state.list.data.opportunities.filter(
            (opportunity) => opportunity.id !== action.payload,
          );
        }
        if (state.board.data) {
          takeFromBoard(state.board.data, action.payload);
        }
        if (state.current.id === action.payload) {
          state.current = initialState.current;
        }
      })
      // A conversation logged on the open opportunity, or an email sent from it, moves its
      // "Last contact" forward, as the API does, without loading the opportunity again.
      .addMatcher(isAnyOf(logConversation.fulfilled, sendEmail.fulfilled), (state, action) => {
        const { record } = action.meta.arg;
        const opportunity = state.current.data;
        if (!opportunity || record.type !== "opportunity" || opportunity.id !== record.id) {
          return;
        }
        const { occurredAt } = action.payload;
        if (opportunity.lastContactAt === null || opportunity.lastContactAt < occurredAt) {
          opportunity.lastContactAt = occurredAt;
        }
      })
      .addMatcher(
        isAnyOf(
          updateOpportunity.fulfilled,
          moveOpportunity.fulfilled,
          closeOpportunity.fulfilled,
          reopenOpportunity.fulfilled,
          assignOpportunity.fulfilled,
          setOpportunityFollowUp.fulfilled,
        ),
        (state, action) => {
          const opportunity = action.payload;
          const index = state.list.data?.opportunities.findIndex(
            (existing) => existing.id === opportunity.id,
          );
          if (state.list.data && index !== undefined && index !== -1) {
            state.list.data.opportunities[index] = opportunity;
          }
          if (state.current.id === opportunity.id) {
            state.current.data = opportunity;
          }
          // On the board the card is replaced where it is, or moved to the top of the column
          // of its new stage. A card the board does not show stays out of it.
          const board = state.board.data;
          const place = findOnBoard(board, opportunity.id);
          if (board && place) {
            takeFromBoard(board, opportunity.id);
            const stayed = place.stageId === opportunity.stage.id;
            putOnBoard(board, opportunity, opportunity.stage.id, stayed ? place.index : 0);
          }
        },
      );
  },
});

const { cardMoved } = opportunitiesSlice.actions;

export const opportunitiesReducer = opportunitiesSlice.reducer;

export const selectOpportunityList = (state: RootState) => state.opportunities.list;
export const selectBoard = (state: RootState) => state.opportunities.board;
export const selectCurrentOpportunity = (state: RootState) => state.opportunities.current;
