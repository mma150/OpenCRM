import { Router } from "express";

import { buildOpenApiDocument } from "./lib/openapi";
import { healthRouter } from "./modules/health/health.routes";

// Mounted by createApp at /api/v1. Every module's router is added here.
export const v1Router = Router();

v1Router.use("/health", healthRouter);

// The one response that is not wrapped in { data, meta }: OpenAPI tools need the bare document.
v1Router.get("/openapi.json", (_req, res) => {
  res.json(buildOpenApiDocument());
});
