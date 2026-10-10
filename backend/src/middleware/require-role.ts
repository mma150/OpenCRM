import type { NextFunction, Request, Response } from "express";

import type { Role } from "../generated/prisma/client";
import { AppError } from "../lib/app-error";
import { getAuth } from "./authenticate";

// Use after `authenticate`: router.use(authenticate, requireRole("ADMIN")).
// Hiding a screen in the web app is cosmetic; this is what enforces the role.
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!roles.includes(getAuth(req).user.role)) {
      throw new AppError("FORBIDDEN", 403, "You do not have access to this");
    }
    next();
  };
}
