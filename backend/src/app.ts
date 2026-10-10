import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./env";
import { httpLogger } from "./lib/logger";
import { errorHandler } from "./middleware/error-handler";
import { notFound } from "./middleware/not-found";
import { createOriginCheck } from "./middleware/origin-check";
import { createAuthLimiters, type RateLimitOptions } from "./middleware/rate-limit";
import { createV1Router } from "./routes";

export interface AppOptions {
  // Tests lift or lower the limits on the public auth routes.
  rateLimit?: RateLimitOptions;
}

export function createApp(options: AppOptions = {}) {
  const app = express();

  const origins = env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  // Behind a reverse proxy, req.ip is the proxy unless Express is told how many to trust.
  if (env.TRUST_PROXY > 0) {
    app.set("trust proxy", env.TRUST_PROXY);
  }

  // Order matters: log first so every response has a request id, then headers. Cookies are
  // read before the origin check (it needs to know whether a session cookie came along),
  // and a refused request never reaches body parsing.
  app.use(httpLogger);
  app.use(helmet());
  app.use(
    cors({ origin: origins, credentials: true, exposedHeaders: ["X-Request-Id"], maxAge: 600 }),
  );
  app.use(cookieParser());
  app.use(createOriginCheck(origins));
  app.use(express.json({ limit: "100kb" }));

  app.use("/api/v1", createV1Router(createAuthLimiters(options.rateLimit)));

  // Last: an unmatched route becomes NOT_FOUND, then every error becomes the error envelope.
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
