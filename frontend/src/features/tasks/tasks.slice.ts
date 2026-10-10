import { createSlice } from "@reduxjs/toolkit";

import type { ApiError } from "@/lib/api/http";
import type { RootState } from "@/store";
import { createAppThunk } from "@/store/thunk";

import { DUE_GROUPS } from "./task-labels";
import * as tasksApi from "./tasks.api";
import type {
  CreateTaskInput,
  DueGroup,
  TaskList,
  TaskListQuery,
  UpdateTaskInput,
} from "./tasks.types";

type Status = "idle" | "loading" | "succeeded" | "failed";

// How many tasks one group of the open view holds. A group with more says so and asks the
// user to search; the count beside its heading still covers every task.
export const GROUP_PAGE_SIZE = 50;

// What narrows the open view: the search text and whose tasks ("" is everyone's).
export type OpenTasksQuery = { search: string; assigneeId: string };

// The open tasks, sorted into the four groups the API knows (`due=`), soonest first.
export type TaskGroups = Record<DueGroup, TaskList>;

// The slice loads two things, so it holds the usual three keys twice, each with the `query`
// it was asked for:
//   open: the open tasks in their four groups (the Tasks page)
//   done: one page of completed tasks (its Done view)
// `completed` holds the ids of the tasks that were ticked off in this session. Every list of
// open tasks (the Tasks page, Home, a record's Tasks card) leaves them out, which is what
// makes completing a task show at once: see `completeTask`.
type TasksState = {
  open: {
    data: TaskGroups | null;
    status: Status;
    error: ApiError | null;
    query: OpenTasksQuery | null;
  };
  done: {
    data: TaskList | null;
    status: Status;
    error: ApiError | null;
    query: TaskListQuery | null;
  };
  completed: string[];
};

const initialState: TasksState = {
  open: { data: null, status: "idle", error: null, query: null },
  done: { data: null, status: "idle", error: null, query: null },
  completed: [],
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

// Loads the four groups of open tasks, one request each, so the API decides which task is
// overdue and which is due today (in the viewer's time zone) and counts each group.
export const fetchOpenTasks = createAppThunk(
  "tasks/fetchOpen",
  async (query: OpenTasksQuery, { rejectWithValue }) => {
    try {
      const lists = await Promise.all(
        DUE_GROUPS.map((due) =>
          tasksApi.listTasks({
            status: "OPEN",
            due,
            ...(query.search ? { search: query.search } : {}),
            ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
            sort: "dueAt",
            order: "asc",
            page: 1,
            pageSize: GROUP_PAGE_SIZE,
          }),
        ),
      );
      return Object.fromEntries(DUE_GROUPS.map((due, index) => [due, lists[index]])) as TaskGroups;
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      return rejectWithValue(error as ApiError);
    }
  },
  {
    // Skip the request while the same one is already in flight. A different query is let
    // through, and the older answer is then ignored.
    condition: (query, { getState }) => {
      const { open } = getState().tasks;
      return !(open.status === "loading" && sameQuery(query, open.query));
    },
  },
);

export const fetchDoneTasks = createAppThunk(
  "tasks/fetchDone",
  async (query: TaskListQuery, { rejectWithValue }) => {
    try {
      return await tasksApi.listTasks(query);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
  {
    condition: (query, { getState }) => {
      const { done } = getState().tasks;
      return !(done.status === "loading" && sameQuery(query, done.query));
    },
  },
);

// Reloads what the Tasks page has loaded, with the queries it was last asked for, so a
// change shows where it belongs (a new due date moves a task to another group).
function reloadTasks(api: {
  dispatch: (
    action: ReturnType<typeof fetchOpenTasks> | ReturnType<typeof fetchDoneTasks>,
  ) => unknown;
  getState: () => RootState;
}): void {
  const { open, done } = api.getState().tasks;
  if (open.query) {
    void api.dispatch(fetchOpenTasks(open.query));
  }
  if (done.query) {
    void api.dispatch(fetchDoneTasks(done.query));
  }
}

// The thunks below are mutations: a dialog or a checkbox dispatches one, awaits `.unwrap()`
// and shows the rejection itself, so they do not touch `status` or `error`. The lists are
// then reloaded.
export const createTask = createAppThunk(
  "tasks/create",
  async (input: CreateTaskInput, { dispatch, getState, rejectWithValue }) => {
    try {
      const task = await tasksApi.createTask(input);
      reloadTasks({ dispatch, getState });
      return task;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const updateTask = createAppThunk(
  "tasks/update",
  async (
    arg: { id: string; changes: UpdateTaskInput },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const task = await tasksApi.updateTask(arg.id, arg.changes);
      reloadTasks({ dispatch, getState });
      return task;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const deleteTask = createAppThunk(
  "tasks/delete",
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    try {
      await tasksApi.deleteTask(id);
      reloadTasks({ dispatch, getState });
      return id;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

// Ticking a task off is optimistic, like moving a card on the board: a checkbox that waits
// for the server feels broken. The id goes into `completed` when the request starts, which
// takes the task out of every open list at once, and comes back out if the API refuses, so
// the task reappears exactly where it was. The caller then says so (`useTaskToggle`).
export const completeTask = createAppThunk(
  "tasks/complete",
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    try {
      const task = await tasksApi.completeTask(id);
      reloadTasks({ dispatch, getState });
      return task;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

export const reopenTask = createAppThunk(
  "tasks/reopen",
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    try {
      const task = await tasksApi.reopenTask(id);
      reloadTasks({ dispatch, getState });
      return task;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  },
);

const tasksSlice = createSlice({
  name: "tasks",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchOpenTasks.pending, (state, action) => {
        state.open.status = "loading";
        state.open.error = null;
        state.open.query = action.meta.arg;
      })
      .addCase(fetchOpenTasks.fulfilled, (state, action) => {
        // An answer to an older query is dropped: a newer request is on its way.
        if (sameQuery(action.meta.arg, state.open.query)) {
          state.open.status = "succeeded";
          state.open.data = action.payload;
        }
      })
      .addCase(fetchOpenTasks.rejected, (state, action) => {
        if (sameQuery(action.meta.arg, state.open.query)) {
          state.open.status = "failed";
          state.open.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addCase(fetchDoneTasks.pending, (state, action) => {
        state.done.status = "loading";
        state.done.error = null;
        state.done.query = action.meta.arg;
      })
      .addCase(fetchDoneTasks.fulfilled, (state, action) => {
        if (sameQuery(action.meta.arg, state.done.query)) {
          state.done.status = "succeeded";
          state.done.data = action.payload;
        }
      })
      .addCase(fetchDoneTasks.rejected, (state, action) => {
        if (sameQuery(action.meta.arg, state.done.query)) {
          state.done.status = "failed";
          state.done.error = action.payload ?? unknownError(action.error.message);
        }
      })
      .addCase(completeTask.pending, (state, action) => {
        if (!state.completed.includes(action.meta.arg)) {
          state.completed.push(action.meta.arg);
        }
      })
      .addCase(completeTask.rejected, (state, action) => {
        // Refused: the task is open after all, and shows again where it was.
        state.completed = state.completed.filter((id) => id !== action.meta.arg);
      })
      .addCase(reopenTask.fulfilled, (state, action) => {
        state.completed = state.completed.filter((id) => id !== action.meta.arg);
      });
  },
});

export const tasksReducer = tasksSlice.reducer;

export const selectOpenTasks = (state: RootState) => state.tasks.open;
export const selectDoneTasks = (state: RootState) => state.tasks.done;
export const selectCompletedTaskIds = (state: RootState) => state.tasks.completed;

// The tasks of a list that are still open: without the ones ticked off in this session.
export function stillOpen<Item extends { id: string }>(tasks: Item[], completed: string[]): Item[] {
  return completed.length === 0 ? tasks : tasks.filter((task) => !completed.includes(task.id));
}
