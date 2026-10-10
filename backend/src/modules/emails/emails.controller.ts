import type { Request, Response } from "express";

import type { ApiTimelineEntry } from "../../lib/timeline";
import { getAuth } from "../../middleware/authenticate";
import {
  type EmailDefaults,
  emailDefaultsQuerySchema,
  type EmailPreview,
  previewEmailBodySchema,
  sendEmailBodySchema,
} from "./emails.schema";
import { getEmailDefaults, previewEmail, sendEmail } from "./emails.service";

export async function getEmailDefaultsHandler(req: Request, res: Response) {
  const query = emailDefaultsQuerySchema.parse(req.query);
  const data: EmailDefaults = await getEmailDefaults(getAuth(req).user, {
    type: query.recordType,
    id: query.recordId,
  });
  res.json({ data, meta: {} });
}

export async function previewEmailHandler(req: Request, res: Response) {
  const input = previewEmailBodySchema.parse(req.body);
  const data: EmailPreview = await previewEmail(getAuth(req).user, input);
  res.json({ data, meta: {} });
}

export async function sendEmailHandler(req: Request, res: Response) {
  const input = sendEmailBodySchema.parse(req.body);
  const data: ApiTimelineEntry = await sendEmail(getAuth(req).user, input);
  res.status(201).json({ data, meta: {} });
}
