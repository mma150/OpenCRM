import type { NextFunction, Request, Response } from "express";

import { AppError } from "../lib/app-error";
import { readSessionCookie } from "../lib/session-cookie";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Cross-site request forgery defence for cookie sessions. CORS only hides the response
// from another site; it does not stop the request from running. So a request that changes
// something must come from an allowed origin. Browsers always send Origin on cross-site
// POST/PATCH/DELETE; a client without a cookie (the mobile app with a Bearer token) may
// leave it out.
export function createOriginCheck(allowedOrigins: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const origin = req.get("origin");
    const allowed = origin ? allowedOrigins.includes(origin) : readSessionCookie(req) === null;
    if (!allowed) {
      throw new AppError("FORBIDDEN", 403, "This request did not come from the OpenCRM web app");
    }
    next();
  };
}
