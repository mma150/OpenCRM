import type { Request, Response } from "express";

import type { ListMeta } from "../../lib/list-query";
import { recordIdParamsSchema } from "../../lib/record-fields";
import type { ApiTimelineEntry, RecordType } from "../../lib/timeline";
import { getAuth } from "../../middleware/authenticate";
import {
  addNoteBodySchema,
  logConversationBodySchema,
  timelineQuerySchema,
} from "./timeline.schema";
import { addNote, listTimeline, logConversation } from "./timeline.service";

// Every record type has the same three routes, so each handler is made for a type: the
// routes file asks for `listTimelineHandler("contact")` and so on.

export function listTimelineHandler(type: RecordType) {
  return async (req: Request, res: Response) => {
    const { id } = recordIdParamsSchema.parse(req.params);
    const query = timelineQuerySchema.parse(req.query);
    const { items, total } = await listTimeline(getAuth(req).user, { type, id }, query);
    const meta: ListMeta = { page: query.page, pageSize: query.pageSize, total };
    res.json({ data: items, meta });
  };
}

export function logConversationHandler(type: RecordType) {
  return async (req: Request, res: Response) => {
    const { id } = recordIdParamsSchema.parse(req.params);
    const input = logConversationBodySchema.parse(req.body);
    const data: ApiTimelineEntry = await logConversation(getAuth(req).user, { type, id }, input);
    res.status(201).json({ data, meta: {} });
  };
}

export function addNoteHandler(type: RecordType) {
  return async (req: Request, res: Response) => {
    const { id } = recordIdParamsSchema.parse(req.params);
    const input = addNoteBodySchema.parse(req.body);
    const data: ApiTimelineEntry = await addNote(getAuth(req).user, { type, id }, input);
    res.status(201).json({ data, meta: {} });
  };
}
