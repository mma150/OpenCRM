import cors from "cors";
import express from "express";

import { env } from "./env";
import { errorHandler } from "./middleware/error-handler";
import { healthRouter } from "./modules/health/health.routes";

export function createApp() {
  const app = express();

  const origins = env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.use(cors({ origin: origins, exposedHeaders: ["X-Request-Id"] }));
  app.use(express.json());

  app.use("/api/v1/health", healthRouter);

  app.use(errorHandler);
  return app;
}
