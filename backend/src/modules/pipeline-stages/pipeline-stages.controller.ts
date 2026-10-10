import type { Request, Response } from "express";

import { recordIdParamsSchema } from "../../lib/record-fields";
import { getAuth } from "../../middleware/authenticate";
import {
  type ApiPipelineStage,
  createPipelineStageBodySchema,
  deletePipelineStageBodySchema,
  reorderPipelineStagesBodySchema,
  updatePipelineStageBodySchema,
} from "./pipeline-stages.schema";
import {
  createStage,
  deleteStage,
  listStages,
  renameStage,
  reorderStages,
} from "./pipeline-stages.service";

// Every handler answers with the whole pipeline in order, so a client that changes it
// never has to work out the new positions itself.

export async function listStagesHandler(req: Request, res: Response) {
  const data: ApiPipelineStage[] = await listStages(getAuth(req).user);
  res.json({ data, meta: {} });
}

export async function createStageHandler(req: Request, res: Response) {
  const { name } = createPipelineStageBodySchema.parse(req.body);
  const data: ApiPipelineStage[] = await createStage(getAuth(req).user, name);
  res.status(201).json({ data, meta: {} });
}

export async function renameStageHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const { name } = updatePipelineStageBodySchema.parse(req.body);
  const data: ApiPipelineStage[] = await renameStage(getAuth(req).user, id, name);
  res.json({ data, meta: {} });
}

export async function reorderStagesHandler(req: Request, res: Response) {
  const { ids } = reorderPipelineStagesBodySchema.parse(req.body);
  const data: ApiPipelineStage[] = await reorderStages(getAuth(req).user, ids);
  res.json({ data, meta: {} });
}

export async function deleteStageHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  // The body is optional: an empty stage is deleted without one.
  const { moveToStageId } = deletePipelineStageBodySchema.parse(req.body ?? {});
  const data: ApiPipelineStage[] = await deleteStage(getAuth(req).user, id, moveToStageId);
  res.json({ data, meta: {} });
}
