import type { Request, Response } from "express";

import { sendCsv } from "../../lib/csv-export";
import type { ListMeta } from "../../lib/list-query";
import { recordIdParamsSchema } from "../../lib/record-fields";
import { getAuth } from "../../middleware/authenticate";
import {
  type ApiTask,
  createTaskBodySchema,
  taskListQuerySchema,
  type TaskSummary,
  taskSummaryQuerySchema,
  updateTaskBodySchema,
} from "./tasks.schema";
import {
  completeTask,
  createTask,
  deleteTask,
  exportTasks,
  getTask,
  getTaskSummary,
  listTasks,
  reopenTask,
  updateTask,
} from "./tasks.service";

export async function listTasksHandler(req: Request, res: Response) {
  const query = taskListQuerySchema.parse(req.query);
  const { items, total } = await listTasks(getAuth(req).user, query);
  const meta: ListMeta = { page: query.page, pageSize: query.pageSize, total };
  res.json({ data: items, meta });
}

export async function exportTasksHandler(req: Request, res: Response) {
  const query = taskListQuerySchema.parse(req.query);
  sendCsv(res, "tasks", query.tz, await exportTasks(getAuth(req).user, query));
}

export async function getTaskSummaryHandler(req: Request, res: Response) {
  const { tz } = taskSummaryQuerySchema.parse(req.query);
  const data: TaskSummary = await getTaskSummary(getAuth(req).user, tz);
  res.json({ data, meta: {} });
}

export async function createTaskHandler(req: Request, res: Response) {
  const input = createTaskBodySchema.parse(req.body);
  const data: ApiTask = await createTask(getAuth(req).user, input);
  res.status(201).json({ data, meta: {} });
}

export async function getTaskHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiTask = await getTask(getAuth(req).user, id);
  res.json({ data, meta: {} });
}

export async function updateTaskHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const input = updateTaskBodySchema.parse(req.body);
  const data: ApiTask = await updateTask(getAuth(req).user, id, input);
  res.json({ data, meta: {} });
}

export async function completeTaskHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiTask = await completeTask(getAuth(req).user, id);
  res.json({ data, meta: {} });
}

export async function reopenTaskHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiTask = await reopenTask(getAuth(req).user, id);
  res.json({ data, meta: {} });
}

export async function deleteTaskHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  await deleteTask(getAuth(req).user, id);
  res.json({ data: null, meta: {} });
}
