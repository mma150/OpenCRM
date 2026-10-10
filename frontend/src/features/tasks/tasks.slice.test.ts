import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import { completeTask, createTask, listTasks, reopenTask } from "./tasks.api";
import { answerWith, doneTask, groups, sendQuote, taskList } from "./tasks.fixtures";
import * as slice from "./tasks.slice";
import type { Task, TaskList } from "./tasks.types";

vi.mock("./tasks.api");

const forbidden: ApiError = { code: "FORBIDDEN", message: "Not allowed", details: null };
const mine = { search: "", assigneeId: "me" };

// A promise the test settles by hand, so a request can stay "in flight".
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("tasks slice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data and no error", () => {
    const { tasks } = makeStore().getState();
    expect(tasks.open).toEqual({ data: null, status: "idle", error: null, query: null });
    expect(tasks.done).toEqual({ data: null, status: "idle", error: null, query: null });
    expect(tasks.completed).toEqual([]);
  });

  it("loads the four groups, one request each, and keeps the query", async () => {
    vi.mocked(listTasks).mockImplementation(answerWith(groups));
    const store = makeStore();

    const pending = store.dispatch(slice.fetchOpenTasks({ search: "quote", assigneeId: "me" }));
    expect(store.getState().tasks.open.status).toBe("loading");
    await pending;

    expect(store.getState().tasks.open).toEqual({
      data: groups,
      status: "succeeded",
      error: null,
      query: { search: "quote", assigneeId: "me" },
    });
    expect(vi.mocked(listTasks).mock.calls.map(([query]) => query.due)).toEqual([
      "overdue",
      "today",
      "upcoming",
      "none",
    ]);
    expect(listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ status: "OPEN", search: "quote", assigneeId: "me", sort: "dueAt" }),
    );
  });

  it("leaves out the assignee for everyone's tasks", async () => {
    vi.mocked(listTasks).mockImplementation(answerWith(groups));
    const store = makeStore();

    await store.dispatch(slice.fetchOpenTasks({ search: "", assigneeId: "" }));

    expect(vi.mocked(listTasks).mock.calls[0]?.[0]).not.toHaveProperty("assigneeId");
    expect(vi.mocked(listTasks).mock.calls[0]?.[0]).not.toHaveProperty("search");
  });

  it("goes failed and keeps the ApiError", async () => {
    vi.mocked(listTasks).mockRejectedValue(forbidden);
    const store = makeStore();

    await store.dispatch(slice.fetchOpenTasks(mine));

    expect(store.getState().tasks.open.status).toBe("failed");
    expect(store.getState().tasks.open.error).toEqual(forbidden);
  });

  it("does not start the same request twice, and drops the answer to an older query", async () => {
    const first = deferred<TaskList>();
    vi.mocked(listTasks).mockReturnValue(first.promise);
    const store = makeStore();

    const old = store.dispatch(slice.fetchOpenTasks(mine));
    await store.dispatch(slice.fetchOpenTasks(mine));
    expect(listTasks).toHaveBeenCalledTimes(4);

    vi.mocked(listTasks).mockImplementation(answerWith(groups));
    await store.dispatch(slice.fetchOpenTasks({ search: "deck", assigneeId: "me" }));
    first.resolve(taskList([]));
    await old;

    expect(store.getState().tasks.open.data).toEqual(groups);
    expect(store.getState().tasks.open.query).toEqual({ search: "deck", assigneeId: "me" });
  });

  it("loads the completed tasks as their own list", async () => {
    vi.mocked(listTasks).mockResolvedValue(taskList([doneTask]));
    const store = makeStore();

    await store.dispatch(slice.fetchDoneTasks({ status: "DONE", page: 1, pageSize: 25 }));

    expect(store.getState().tasks.done.data).toEqual(taskList([doneTask]));
    expect(store.getState().tasks.open.data).toBeNull();
  });

  it("hides a task the moment it is ticked off, and reloads the lists once the API agrees", async () => {
    vi.mocked(listTasks).mockImplementation(answerWith(groups));
    const request = deferred<Task>();
    vi.mocked(completeTask).mockReturnValue(request.promise);
    const store = makeStore();
    await store.dispatch(slice.fetchOpenTasks(mine));
    vi.mocked(listTasks).mockClear();

    const pending = store.dispatch(slice.completeTask(sendQuote.id));
    expect(store.getState().tasks.completed).toEqual([sendQuote.id]);
    expect(slice.stillOpen(groups.overdue.tasks, store.getState().tasks.completed)).toEqual([]);

    request.resolve({ ...sendQuote, status: "DONE", completedAt: "2026-10-10T09:00:00.000Z" });
    await pending;

    expect(store.getState().tasks.completed).toEqual([sendQuote.id]);
    expect(listTasks).toHaveBeenCalledTimes(4);
  });

  it("puts the task back when the API refuses to complete it", async () => {
    vi.mocked(completeTask).mockRejectedValue(forbidden);
    const store = makeStore();

    const result = await store.dispatch(slice.completeTask(sendQuote.id));

    expect(result.payload).toEqual(forbidden);
    expect(store.getState().tasks.completed).toEqual([]);
    expect(slice.stillOpen(groups.overdue.tasks, store.getState().tasks.completed)).toEqual([
      sendQuote,
    ]);
  });

  it("shows a reopened task in the open lists again", async () => {
    vi.mocked(completeTask).mockResolvedValue({ ...sendQuote, status: "DONE" });
    vi.mocked(reopenTask).mockResolvedValue(sendQuote);
    const store = makeStore();
    await store.dispatch(slice.completeTask(sendQuote.id));

    await store.dispatch(slice.reopenTask(sendQuote.id));

    expect(store.getState().tasks.completed).toEqual([]);
  });

  it("reloads what is loaded after a task is created, and leaves status and error alone", async () => {
    vi.mocked(listTasks).mockImplementation(answerWith(groups));
    vi.mocked(createTask).mockRejectedValueOnce(forbidden).mockResolvedValue(sendQuote);
    const store = makeStore();
    await store.dispatch(slice.fetchOpenTasks(mine));
    vi.mocked(listTasks).mockClear();

    await store.dispatch(slice.createTask({ title: "Send the revised quote" }));
    expect(store.getState().tasks.open.status).toBe("succeeded");
    expect(store.getState().tasks.open.error).toBeNull();
    expect(listTasks).not.toHaveBeenCalled();

    await store.dispatch(slice.createTask({ title: "Send the revised quote" }));
    expect(listTasks).toHaveBeenCalledTimes(4);
  });
});
