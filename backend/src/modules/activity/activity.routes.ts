import { Router } from "express";

import { errorResponse, jsonResponse, registry, sessionSecurity } from "../../lib/openapi";
import { authenticate } from "../../middleware/authenticate";
import { requireRole } from "../../middleware/require-role";
import { listActivityAuthorsHandler, listActivityHandler } from "./activity.controller";
import {
  activityAuthorsResponseSchema,
  activityQuerySchema,
  activityResponseSchema,
} from "./activity.schema";

export const activityRouter = Router();

// The team feed is for the people who run a team (CONV-04). It only reads: entries are
// written through a record's own routes and are never changed.
activityRouter.use(authenticate, requireRole("ADMIN", "SALES_MANAGER"));

activityRouter.get("/", listActivityHandler);
activityRouter.get("/authors", listActivityAuthorsHandler);

// Documented beside the routes so the two cannot drift apart.
const tags = ["Activity"];
const security = sessionSecurity;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const forbidden = errorResponse("Not an Admin or a Sales Manager (FORBIDDEN)");

registry.registerPath({
  method: "get",
  path: "/activity",
  tags,
  summary: "The team activity feed: what each person did, newest first",
  description:
    "An Admin sees everyone's entries, a Sales Manager their own and their team's. from and to are inclusive and take a day (the whole day, UTC) or an exact moment. meta.summary counts everything the filters match, not only this page. Entries of deleted records are left out.",
  security,
  request: { query: activityQuerySchema },
  responses: {
    200: jsonResponse("One page of entries, each with its record", activityResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: bad input, or a userId outside the Sales Manager's team",
    ),
    401: unauthenticated,
    403: forbidden,
  },
});

registry.registerPath({
  method: "get",
  path: "/activity/authors",
  tags,
  summary: "The people the caller may filter the activity feed by",
  description:
    "For an Admin, every user who is not Read-only, deactivated ones included. For a Sales Manager, themselves and their team.",
  security,
  responses: {
    200: jsonResponse("The people, by name", activityAuthorsResponseSchema),
    401: unauthenticated,
    403: forbidden,
  },
});
