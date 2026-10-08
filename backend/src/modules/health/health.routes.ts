import { Router } from "express";

import { errorResponseSchema, registry } from "../../lib/openapi";
import { getHealthHandler } from "./health.controller";
import { healthResponseSchema } from "./health.schema";

export const healthRouter = Router();

healthRouter.get("/", getHealthHandler);

// Documented beside the route so the two cannot drift apart.
registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["Health"],
  summary: "Check that the API is running and can reach the database",
  responses: {
    200: {
      description: "The API is up and the database answered",
      content: { "application/json": { schema: healthResponseSchema } },
    },
    503: {
      description: "The database cannot be reached (SERVICE_UNAVAILABLE)",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});
