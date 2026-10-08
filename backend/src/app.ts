import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./env";
import { httpLogger } from "./lib/logger";
import { errorHandler } from "./middleware/error-handler";
import { notFound } from "./middleware/not-found";
import { healthRouter } from "./modules/health/health.routes";

export function createApp() {
  const app = express();

  const origins = env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  // Order matters: log first so every response has a request id, then headers, then body parsing.
  app.use(httpLogger);
  app.use(helmet());
  app.use(cors({ origin: origins, exposedHeaders: ["X-Request-Id"] }));
  app.use(express.json());

  app.use("/api/v1/health", healthRouter);

  // Last: an unmatched route becomes NOT_FOUND, then every error becomes the error envelope.
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
