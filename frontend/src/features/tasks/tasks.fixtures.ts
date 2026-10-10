import { adminUser, repUser } from "@/test/render-with-store";

import type { TaskGroups } from "./tasks.slice";
import type { Task, TaskList, TaskListQuery } from "./tasks.types";

// The Admin's own task, linked to a lead, due a few days ago, with a reminder an hour before.
export const sendQuote: Task = {
  id: "ffffffff-ffff-4fff-8fff-fffffffffff1",
  title: "Send the revised quote",
  description: "Include the volume discount.",
  dueAt: "2026-10-05T09:00:00.000Z",
  status: "OPEN",
  completedAt: null,
  assignee: { id: adminUser.id, name: adminUser.name },
  createdBy: { id: adminUser.id, name: adminUser.name },
  record: { type: "LEAD", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", name: "Marcus Chen" },
  reminderAt: "2026-10-05T08:00:00.000Z",
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-01T09:00:00.000Z",
};

// A task the Admin gave to the rep, linked to nothing.
export const callBack: Task = {
  id: "ffffffff-ffff-4fff-8fff-fffffffffff2",
  title: "Call back about fleet pricing",
  description: null,
  dueAt: "2026-10-08T14:00:00.000Z",
  status: "OPEN",
  completedAt: null,
  assignee: { id: repUser.id, name: repUser.name },
  createdBy: { id: adminUser.id, name: adminUser.name },
  record: null,
  reminderAt: null,
  createdAt: "2026-10-02T09:00:00.000Z",
  updatedAt: "2026-10-02T09:00:00.000Z",
};

export const prepareDeck: Task = {
  id: "ffffffff-ffff-4fff-8fff-fffffffffff3",
  title: "Prepare the proposal deck",
  description: null,
  dueAt: "2026-12-01T10:00:00.000Z",
  status: "OPEN",
  completedAt: null,
  assignee: { id: adminUser.id, name: adminUser.name },
  createdBy: { id: adminUser.id, name: adminUser.name },
  record: {
    type: "OPPORTUNITY",
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
    name: "Northwind - Fleet Expansion",
  },
  reminderAt: null,
  createdAt: "2026-10-03T09:00:00.000Z",
  updatedAt: "2026-10-03T09:00:00.000Z",
};

export const tidyUp: Task = {
  id: "ffffffff-ffff-4fff-8fff-fffffffffff4",
  title: "Tidy the demo environment",
  description: null,
  dueAt: null,
  status: "OPEN",
  completedAt: null,
  assignee: { id: adminUser.id, name: adminUser.name },
  createdBy: { id: adminUser.id, name: adminUser.name },
  record: null,
  reminderAt: null,
  createdAt: "2026-10-04T09:00:00.000Z",
  updatedAt: "2026-10-04T09:00:00.000Z",
};

export const doneTask: Task = {
  ...tidyUp,
  id: "ffffffff-ffff-4fff-8fff-fffffffffff5",
  title: "Book the meeting room",
  status: "DONE",
  completedAt: "2026-10-06T11:00:00.000Z",
};

export function taskList(tasks: Task[], total = tasks.length): TaskList {
  return { tasks, page: 1, pageSize: 50, total };
}

// The four groups of the open view, one task in each.
export const groups: TaskGroups = {
  overdue: taskList([sendQuote]),
  today: taskList([callBack]),
  upcoming: taskList([prepareDeck]),
  none: taskList([tidyUp]),
};

// A stand-in for `listTasks`: answers each request of the open view with its group, and a
// request for completed tasks with `done`.
export function answerWith(open: TaskGroups, done: Task[] = [doneTask]) {
  return (query: TaskListQuery): Promise<TaskList> => {
    if (query.status === "DONE") {
      return Promise.resolve(taskList(done));
    }
    return Promise.resolve(query.due ? open[query.due] : taskList([]));
  };
}
