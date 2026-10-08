import type { NextFunction, Request, Response } from "express";

// Four arguments are what mark this as Express error middleware.
// The cause goes to stderr; the response carries a code and a generic message only.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Internal server error", details: null },
  });
}
