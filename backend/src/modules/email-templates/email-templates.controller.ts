import type { Request, Response } from "express";

import { recordIdParamsSchema } from "../../lib/record-fields";
import { getAuth } from "../../middleware/authenticate";
import {
  type ApiEmailTemplate,
  type ApiPlaceholder,
  createEmailTemplateBodySchema,
  updateEmailTemplateBodySchema,
} from "./email-templates.schema";
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listPlaceholders,
  listTemplates,
  updateTemplate,
} from "./email-templates.service";

export async function listTemplatesHandler(req: Request, res: Response) {
  const data: ApiEmailTemplate[] = await listTemplates(getAuth(req).user);
  res.json({ data, meta: {} });
}

export function listPlaceholdersHandler(_req: Request, res: Response) {
  const data: ApiPlaceholder[] = listPlaceholders();
  res.json({ data, meta: {} });
}

export async function createTemplateHandler(req: Request, res: Response) {
  const input = createEmailTemplateBodySchema.parse(req.body);
  const data: ApiEmailTemplate = await createTemplate(getAuth(req).user, input);
  res.status(201).json({ data, meta: {} });
}

export async function getTemplateHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiEmailTemplate = await getTemplate(getAuth(req).user, id);
  res.json({ data, meta: {} });
}

export async function updateTemplateHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const input = updateEmailTemplateBodySchema.parse(req.body);
  const data: ApiEmailTemplate = await updateTemplate(getAuth(req).user, id, input);
  res.json({ data, meta: {} });
}

export async function deleteTemplateHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  await deleteTemplate(getAuth(req).user, id);
  res.json({ data: null, meta: {} });
}
