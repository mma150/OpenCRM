import type { Request, Response } from "express";

import { sendCsv } from "../../lib/csv-export";
import { getAuth } from "../../middleware/authenticate";
import {
  type ActivityAuthor,
  activityExportQuerySchema,
  type ActivityMeta,
  activityQuerySchema,
} from "./activity.schema";
import { exportActivity, listActivity, listActivityAuthors } from "./activity.service";

export async function listActivityHandler(req: Request, res: Response) {
  const query = activityQuerySchema.parse(req.query);
  const { items, total, summary } = await listActivity(getAuth(req).user, query);
  const meta: ActivityMeta = { page: query.page, pageSize: query.pageSize, total, summary };
  res.json({ data: items, meta });
}

export async function exportActivityHandler(req: Request, res: Response) {
  const query = activityExportQuerySchema.parse(req.query);
  sendCsv(res, "activity", query.tz, await exportActivity(getAuth(req).user, query));
}

export async function listActivityAuthorsHandler(req: Request, res: Response) {
  const data: ActivityAuthor[] = await listActivityAuthors(getAuth(req).user);
  res.json({ data, meta: {} });
}
