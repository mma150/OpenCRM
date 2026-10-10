import type { Request, Response } from "express";

import type { ListMeta } from "../../lib/list-query";
import { recordIdParamsSchema } from "../../lib/record-fields";
import { getAuth } from "../../middleware/authenticate";
import {
  type ApiNotification,
  type MarkedRead,
  notificationListQuerySchema,
  type UnreadCount,
} from "./notifications.schema";
import { countUnread, listNotifications, markAllRead, markRead } from "./notifications.service";

export async function listNotificationsHandler(req: Request, res: Response) {
  const query = notificationListQuerySchema.parse(req.query);
  const { items, total } = await listNotifications(getAuth(req).user.id, query);
  const meta: ListMeta = { page: query.page, pageSize: query.pageSize, total };
  res.json({ data: items, meta });
}

export async function countUnreadHandler(req: Request, res: Response) {
  const data: UnreadCount = await countUnread(getAuth(req).user.id);
  res.json({ data, meta: {} });
}

export async function markReadHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiNotification = await markRead(getAuth(req).user.id, id);
  res.json({ data, meta: {} });
}

export async function markAllReadHandler(req: Request, res: Response) {
  const data: MarkedRead = await markAllRead(getAuth(req).user.id);
  res.json({ data, meta: {} });
}
