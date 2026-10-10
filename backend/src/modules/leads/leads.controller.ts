import type { Request, Response } from "express";

import { sendCsv } from "../../lib/csv-export";
import { parseCustomFieldFilters } from "../../lib/custom-fields";
import type { ListMeta } from "../../lib/list-query";
import { followUpBodySchema, recordIdParamsSchema } from "../../lib/record-fields";
import { getAuth } from "../../middleware/authenticate";
import {
  type ApiLead,
  assignLeadBodySchema,
  convertLeadBodySchema,
  createLeadBodySchema,
  leadExportQuerySchema,
  leadListQuerySchema,
  markLeadLostBodySchema,
  updateLeadBodySchema,
} from "./leads.schema";
import {
  assignLead,
  convertLead,
  createLead,
  deleteLead,
  exportLeads,
  getLead,
  listLeads,
  markLeadLost,
  setLeadFollowUp,
  updateLead,
} from "./leads.service";

export async function listLeadsHandler(req: Request, res: Response) {
  const query = leadListQuerySchema.parse(req.query);
  const filters = parseCustomFieldFilters(req.query);
  const { items, total } = await listLeads(getAuth(req).user, query, filters);
  const meta: ListMeta = { page: query.page, pageSize: query.pageSize, total };
  res.json({ data: items, meta });
}

export async function exportLeadsHandler(req: Request, res: Response) {
  const query = leadExportQuerySchema.parse(req.query);
  const filters = parseCustomFieldFilters(req.query);
  sendCsv(res, "leads", query.tz, await exportLeads(getAuth(req).user, query, filters));
}

export async function createLeadHandler(req: Request, res: Response) {
  const input = createLeadBodySchema.parse(req.body);
  const data: ApiLead = await createLead(getAuth(req).user, input);
  res.status(201).json({ data, meta: {} });
}

export async function getLeadHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiLead = await getLead(getAuth(req).user, id);
  res.json({ data, meta: {} });
}

export async function updateLeadHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const input = updateLeadBodySchema.parse(req.body);
  const data: ApiLead = await updateLead(getAuth(req).user, id, input);
  res.json({ data, meta: {} });
}

export async function markLeadLostHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const input = markLeadLostBodySchema.parse(req.body);
  const data: ApiLead = await markLeadLost(getAuth(req).user, id, input);
  res.json({ data, meta: {} });
}

export async function assignLeadHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const { ownerId } = assignLeadBodySchema.parse(req.body);
  const data: ApiLead = await assignLead(getAuth(req).user, id, ownerId);
  res.json({ data, meta: {} });
}

export async function convertLeadHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const input = convertLeadBodySchema.parse(req.body);
  const data: ApiLead = await convertLead(getAuth(req).user, id, input);
  res.json({ data, meta: {} });
}

export async function setLeadFollowUpHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const input = followUpBodySchema.parse(req.body);
  const data: ApiLead = await setLeadFollowUp(getAuth(req).user, id, input);
  res.json({ data, meta: {} });
}

export async function deleteLeadHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  await deleteLead(getAuth(req).user, id);
  res.json({ data: null, meta: {} });
}
