import type { Request, Response } from "express";

import { recordIdParamsSchema } from "../../lib/record-fields";
import { getAuth } from "../../middleware/authenticate";
import {
  type ApiCustomField,
  createCustomFieldBodySchema,
  customFieldListQuerySchema,
  reorderCustomFieldsBodySchema,
  updateCustomFieldBodySchema,
} from "./custom-fields.schema";
import {
  archiveCustomField,
  createCustomField,
  deleteCustomField,
  listCustomFields,
  reorderCustomFields,
  restoreCustomField,
  updateCustomField,
} from "./custom-fields.service";

export async function listCustomFieldsHandler(req: Request, res: Response) {
  const query = customFieldListQuerySchema.parse(req.query);
  const data: ApiCustomField[] = await listCustomFields(getAuth(req).user, query);
  res.json({ data, meta: {} });
}

export async function createCustomFieldHandler(req: Request, res: Response) {
  const input = createCustomFieldBodySchema.parse(req.body);
  const data: ApiCustomField = await createCustomField(input);
  res.status(201).json({ data, meta: {} });
}

export async function updateCustomFieldHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const input = updateCustomFieldBodySchema.parse(req.body);
  const data: ApiCustomField = await updateCustomField(id, input);
  res.json({ data, meta: {} });
}

export async function reorderCustomFieldsHandler(req: Request, res: Response) {
  const input = reorderCustomFieldsBodySchema.parse(req.body);
  const data: ApiCustomField[] = await reorderCustomFields(input);
  res.json({ data, meta: {} });
}

export async function archiveCustomFieldHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiCustomField = await archiveCustomField(id);
  res.json({ data, meta: {} });
}

export async function restoreCustomFieldHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiCustomField = await restoreCustomField(id);
  res.json({ data, meta: {} });
}

export async function deleteCustomFieldHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  await deleteCustomField(id);
  res.json({ data: null, meta: {} });
}
