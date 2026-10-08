import type { Request, Response } from "express";

// Registered after every route: anything that reaches it matched no route.
export function notFound(_req: Request, res: Response) {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Route not found", details: null },
  });
}
