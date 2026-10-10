import type { Request, Response } from "express";

import { getAuth } from "../../middleware/authenticate";
import { type ActivityAuthor, type ActivityMeta, activityQuerySchema } from "./activity.schema";
import { listActivity, listActivityAuthors } from "./activity.service";

export async function listActivityHandler(req: Request, res: Response) {
  const query = activityQuerySchema.parse(req.query);
  const { items, total, summary } = await listActivity(getAuth(req).user, query);
  const meta: ActivityMeta = { page: query.page, pageSize: query.pageSize, total, summary };
  res.json({ data: items, meta });
}

export async function listActivityAuthorsHandler(req: Request, res: Response) {
  const data: ActivityAuthor[] = await listActivityAuthors(getAuth(req).user);
  res.json({ data, meta: {} });
}
