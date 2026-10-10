import type { Request, Response } from "express";

import {
  type ApiEmailSettings,
  type EmailStatus,
  testEmailBodySchema,
  type TestEmailResult,
  updateEmailSettingsBodySchema,
} from "./email-settings.schema";
import {
  deleteEmailSettings,
  getEmailSettings,
  getEmailStatus,
  saveEmailSettings,
  sendTestEmail,
} from "./email-settings.service";

export async function getEmailStatusHandler(_req: Request, res: Response) {
  const data: EmailStatus = await getEmailStatus();
  res.json({ data, meta: {} });
}

export async function getEmailSettingsHandler(_req: Request, res: Response) {
  const data: ApiEmailSettings = await getEmailSettings();
  res.json({ data, meta: {} });
}

export async function saveEmailSettingsHandler(req: Request, res: Response) {
  const input = updateEmailSettingsBodySchema.parse(req.body);
  const data: ApiEmailSettings = await saveEmailSettings(input);
  res.json({ data, meta: {} });
}

export async function deleteEmailSettingsHandler(_req: Request, res: Response) {
  const data: ApiEmailSettings = await deleteEmailSettings();
  res.json({ data, meta: {} });
}

export async function sendTestEmailHandler(req: Request, res: Response) {
  const { to } = testEmailBodySchema.parse(req.body);
  const data: TestEmailResult = await sendTestEmail(to);
  res.json({ data, meta: {} });
}
