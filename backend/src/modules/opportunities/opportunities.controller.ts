import type { Request, Response } from "express";

import type { ListMeta } from "../../lib/list-query";
import { followUpBodySchema, recordIdParamsSchema } from "../../lib/record-fields";
import { getAuth } from "../../middleware/authenticate";
import {
  type ApiOpportunity,
  assignOpportunityBodySchema,
  type BoardColumn,
  boardQuerySchema,
  closeOpportunityBodySchema,
  createOpportunityBodySchema,
  moveOpportunityBodySchema,
  opportunityListQuerySchema,
  reopenOpportunityBodySchema,
  updateOpportunityBodySchema,
} from "./opportunities.schema";
import {
  assignOpportunity,
  closeOpportunity,
  createOpportunity,
  deleteOpportunity,
  getBoard,
  getOpportunity,
  listOpportunities,
  moveOpportunity,
  reopenOpportunity,
  setOpportunityFollowUp,
  updateOpportunity,
} from "./opportunities.service";

export async function listOpportunitiesHandler(req: Request, res: Response) {
  const query = opportunityListQuerySchema.parse(req.query);
  const { items, total } = await listOpportunities(getAuth(req).user, query);
  const meta: ListMeta = { page: query.page, pageSize: query.pageSize, total };
  res.json({ data: items, meta });
}

export async function getBoardHandler(req: Request, res: Response) {
  const query = boardQuerySchema.parse(req.query);
  const data: BoardColumn[] = await getBoard(getAuth(req).user, query);
  res.json({ data, meta: {} });
}

export async function createOpportunityHandler(req: Request, res: Response) {
  const input = createOpportunityBodySchema.parse(req.body);
  const data: ApiOpportunity = await createOpportunity(getAuth(req).user, input);
  res.status(201).json({ data, meta: {} });
}

export async function getOpportunityHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiOpportunity = await getOpportunity(getAuth(req).user, id);
  res.json({ data, meta: {} });
}

export async function updateOpportunityHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const input = updateOpportunityBodySchema.parse(req.body);
  const data: ApiOpportunity = await updateOpportunity(getAuth(req).user, id, input);
  res.json({ data, meta: {} });
}

export async function moveOpportunityHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const { stageId } = moveOpportunityBodySchema.parse(req.body);
  const data: ApiOpportunity = await moveOpportunity(getAuth(req).user, id, stageId);
  res.json({ data, meta: {} });
}

export async function closeOpportunityHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const input = closeOpportunityBodySchema.parse(req.body);
  const data: ApiOpportunity = await closeOpportunity(getAuth(req).user, id, input);
  res.json({ data, meta: {} });
}

export async function reopenOpportunityHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  // The body is optional: without one the opportunity goes back to the first open stage.
  const { stageId } = reopenOpportunityBodySchema.parse(req.body ?? {});
  const data: ApiOpportunity = await reopenOpportunity(getAuth(req).user, id, stageId);
  res.json({ data, meta: {} });
}

export async function assignOpportunityHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const { ownerId } = assignOpportunityBodySchema.parse(req.body);
  const data: ApiOpportunity = await assignOpportunity(getAuth(req).user, id, ownerId);
  res.json({ data, meta: {} });
}

export async function setOpportunityFollowUpHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const input = followUpBodySchema.parse(req.body);
  const data: ApiOpportunity = await setOpportunityFollowUp(getAuth(req).user, id, input);
  res.json({ data, meta: {} });
}

export async function deleteOpportunityHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  await deleteOpportunity(getAuth(req).user, id);
  res.json({ data: null, meta: {} });
}
