import { type DownloadedFile, downloadExport } from "@/lib/api/download";
import { http } from "@/lib/api/http";
import { browserTimeZone } from "@/lib/time-zone";

import type {
  CreateTaskInput,
  CreateTaskResponse,
  Task,
  TaskList,
  TaskListQuery,
  TaskResponse,
  TasksResponse,
  UpdateTaskInput,
} from "./tasks.types";

// One page of the tasks the signed-in user may see. `meta.total` counts every match. The
// viewer's time zone goes with every request: it decides what "overdue" and "today" mean.
export async function listTasks(query: TaskListQuery): Promise<TaskList> {
  const response = await http.get<TasksResponse>("/tasks", {
    params: { ...query, tz: browserTimeZone() },
  });
  return { tasks: response.data.data, ...response.data.meta };
}

// The list as a CSV file: every match of the same search and filters, not one page.
// `downloadExport` adds the time zone, as `listTasks` does.
export function exportTasks(query: TaskListQuery): Promise<DownloadedFile> {
  return downloadExport("/tasks/export", query, "tasks.csv");
}

export async function getTask(id: string): Promise<Task> {
  const response = await http.get<TaskResponse>(`/tasks/${id}`);
  return response.data.data;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const response = await http.post<CreateTaskResponse>("/tasks", input);
  return response.data.data;
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  const response = await http.patch<TaskResponse>(`/tasks/${id}`, input);
  return response.data.data;
}

export async function completeTask(id: string): Promise<Task> {
  const response = await http.post<TaskResponse>(`/tasks/${id}/complete`);
  return response.data.data;
}

export async function reopenTask(id: string): Promise<Task> {
  const response = await http.post<TaskResponse>(`/tasks/${id}/reopen`);
  return response.data.data;
}

export async function deleteTask(id: string): Promise<void> {
  await http.delete(`/tasks/${id}`);
}
