import type { Request, Response } from "express";

import { type ApiOrganization, updateOrganizationBodySchema } from "./organization.schema";
import { getOrganization, updateOrganization } from "./organization.service";

export async function getOrganizationHandler(_req: Request, res: Response) {
  const data: ApiOrganization = await getOrganization();
  res.json({ data, meta: {} });
}

export async function updateOrganizationHandler(req: Request, res: Response) {
  const input = updateOrganizationBodySchema.parse(req.body);
  const data: ApiOrganization = await updateOrganization(input);
  res.json({ data, meta: {} });
}
