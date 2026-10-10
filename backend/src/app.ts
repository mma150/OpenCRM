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

const IMPORT_ROUTES = "/api/v1/imports";

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
    cors({
      origin: origins,
      credentials: true,
      // Content-Disposition and X-Export-Truncated belong to the CSV exports.
      exposedHeaders: ["X-Request-Id", "Content-Disposition", "X-Export-Truncated"],
      maxAge: 600,
    }),
  );
  app.use(cookieParser());
  app.use(createOriginCheck(origins));
  // The import routes take a whole CSV file in their JSON body. They parse it themselves
  // with a higher limit, after their sign-in and role checks (modules/imports), so nobody
  // else can make the API read a large body.
  const parseJson = express.json({ limit: "100kb" });
  app.use((req, res, next) => {
    if (req.path.startsWith(IMPORT_ROUTES)) {
      next();
    } else {
      parseJson(req, res, next);
    }
  });

  app.use("/api/v1", createV1Router(createAuthLimiters(options.rateLimit)));

  // Last: an unmatched route becomes NOT_FOUND, then every error becomes the error envelope.
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
