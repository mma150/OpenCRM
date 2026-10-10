import type { Request, Response } from "express";

import { getAuth } from "../../middleware/authenticate";
import {
  importBodySchema,
  type ImportField,
  importFieldsQuerySchema,
  type ImportPreview,
  importPreviewBodySchema,
  type ImportResult,
} from "./imports.schema";
import { listImportFields, previewImport, runImport } from "./imports.service";

export async function listImportFieldsHandler(req: Request, res: Response) {
  const { type } = importFieldsQuerySchema.parse(req.query);
  const data: ImportField[] = await listImportFields(type);
  res.json({ data, meta: {} });
}

export async function previewImportHandler(req: Request, res: Response) {
  const input = importPreviewBodySchema.parse(req.body);
  const data: ImportPreview = await previewImport(input);
  res.json({ data, meta: {} });
}

export async function runImportHandler(req: Request, res: Response) {
  const input = importBodySchema.parse(req.body);
  const data: ImportResult = await runImport(getAuth(req).user, input);
  res.json({ data, meta: {} });
}
