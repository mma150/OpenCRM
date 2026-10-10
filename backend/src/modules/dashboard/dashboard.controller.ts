import type { Request, Response } from "express";

import { getAuth } from "../../middleware/authenticate";
import {
  type MyDashboard,
  myDashboardQuerySchema,
  type TeamDashboard,
  teamDashboardQuerySchema,
} from "./dashboard.schema";
import { getMyDashboard, getTeamDashboard } from "./dashboard.service";

export async function getMyDashboardHandler(req: Request, res: Response) {
  const { tz } = myDashboardQuerySchema.parse(req.query);
  const data: MyDashboard = await getMyDashboard(getAuth(req).user, tz);
  res.json({ data, meta: {} });
}

export async function getTeamDashboardHandler(req: Request, res: Response) {
  const query = teamDashboardQuerySchema.parse(req.query);
  const data: TeamDashboard = await getTeamDashboard(getAuth(req).user, query);
  res.json({ data, meta: {} });
}
