import type { Request, Response } from "express";

import type { Health } from "./health.schema";
import { getHealth } from "./health.service";

// Express 5 forwards a rejected promise to the error handler, so no try/catch.
export async function getHealthHandler(_req: Request, res: Response) {
  const data: Health = await getHealth();
  res.json({ data, meta: {} });
}
