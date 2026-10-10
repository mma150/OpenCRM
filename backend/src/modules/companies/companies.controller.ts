import type { Request, Response } from "express";

import { sendCsv } from "../../lib/csv-export";
import { parseCustomFieldFilters } from "../../lib/custom-fields";
import type { ListMeta } from "../../lib/list-query";
import { recordIdParamsSchema } from "../../lib/record-fields";
import { getAuth } from "../../middleware/authenticate";
import {
  type ApiCompany,
  assignCompanyBodySchema,
  companyExportQuerySchema,
  companyListQuerySchema,
  createCompanyBodySchema,
  updateCompanyBodySchema,
} from "./companies.schema";
import {
  assignCompany,
  createCompany,
  deleteCompany,
  exportCompanies,
  getCompany,
  listCompanies,
  listIndustries,
  updateCompany,
} from "./companies.service";

export async function listCompaniesHandler(req: Request, res: Response) {
  const query = companyListQuerySchema.parse(req.query);
  const filters = parseCustomFieldFilters(req.query);
  const { items, total } = await listCompanies(getAuth(req).user, query, filters);
  const meta: ListMeta = { page: query.page, pageSize: query.pageSize, total };
  res.json({ data: items, meta });
}

export async function exportCompaniesHandler(req: Request, res: Response) {
  const query = companyExportQuerySchema.parse(req.query);
  const filters = parseCustomFieldFilters(req.query);
  sendCsv(res, "companies", query.tz, await exportCompanies(getAuth(req).user, query, filters));
}

export async function listIndustriesHandler(req: Request, res: Response) {
  const data: string[] = await listIndustries(getAuth(req).user);
  res.json({ data, meta: {} });
}

export async function createCompanyHandler(req: Request, res: Response) {
  const input = createCompanyBodySchema.parse(req.body);
  const data: ApiCompany = await createCompany(getAuth(req).user, input);
  res.status(201).json({ data, meta: {} });
}

export async function getCompanyHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiCompany = await getCompany(getAuth(req).user, id);
  res.json({ data, meta: {} });
}

export async function updateCompanyHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const input = updateCompanyBodySchema.parse(req.body);
  const data: ApiCompany = await updateCompany(getAuth(req).user, id, input);
  res.json({ data, meta: {} });
}

export async function assignCompanyHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const { ownerId } = assignCompanyBodySchema.parse(req.body);
  const data: ApiCompany = await assignCompany(getAuth(req).user, id, ownerId);
  res.json({ data, meta: {} });
}

export async function deleteCompanyHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  await deleteCompany(getAuth(req).user, id);
  res.json({ data: null, meta: {} });
}
