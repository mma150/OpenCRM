import { Router } from "express";

import {
  csvResponse,
  errorResponse,
  jsonResponse,
  registry,
  sessionSecurity,
} from "../../lib/openapi";
import { CSV_EXPORT } from "../../lib/route-docs";
import { authenticate } from "../../middleware/authenticate";
import { requireRole } from "../../middleware/require-role";
import {
  exportActivityHandler,
  listActivityAuthorsHandler,
  listActivityHandler,
} from "./activity.controller";
import {
  activityAuthorsResponseSchema,
  activityExportQuerySchema,
  activityQuerySchema,
  activityResponseSchema,
} from "./activity.schema";

export const activityRouter = Router();

// The team feed is for the people who run a team (CONV-04), and for a Read-only user, the
// viewer role that sees every record. It only reads: entries are written through a record's
// own routes and are never changed. A Sales Rep has no feed.
activityRouter.use(authenticate, requireRole("ADMIN", "SALES_MANAGER", "READ_ONLY"));

activityRouter.get("/", listActivityHandler);
activityRouter.get("/export", exportActivityHandler);
activityRouter.get("/authors", listActivityAuthorsHandler);

// Documented beside the routes so the two cannot drift apart.
const tags = ["Activity"];
const security = sessionSecurity;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const forbidden = errorResponse("A Sales Rep (FORBIDDEN)");
const validationFailed = errorResponse(
  "VALIDATION_FAILED: bad input, or a userId outside the Sales Manager's team",
);

registry.registerPath({
  method: "get",
  path: "/activity",
  tags,
  summary: "The team activity feed: what each person did, newest first",
  description:
    "For an Admin, a Sales Manager and a Read-only user; a Sales Rep is refused. An Admin and a Read-only user see everyone's entries, a Sales Manager their own and their team's. from and to are inclusive and take a day (the whole day, UTC) or an exact moment. meta.summary counts everything the filters match, not only this page. Entries of deleted records are left out.",
  security,
  request: { query: activityQuerySchema },
  responses: {
    200: jsonResponse("One page of entries, each with its record", activityResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    403: forbidden,
  },
});

registry.registerPath({
  method: "get",
  path: "/activity/export",
  tags,
  summary: "Download the activity feed the caller may see as a CSV file",
  description: `The feed with the same scope and filters (userId, from, to, kind), newest first; each entry names its record. ${CSV_EXPORT} For an Admin, a Sales Manager and a Read-only user; the file is named activity-YYYY-MM-DD.csv.`,
  security,
  request: { query: activityExportQuerySchema },
  responses: {
    200: csvResponse("The CSV file"),
    400: validationFailed,
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
    "For an Admin and a Read-only user, every user who is not Read-only, deactivated ones included. For a Sales Manager, themselves and their team.",
  security,
  responses: {
    200: jsonResponse("The people, by name", activityAuthorsResponseSchema),
    401: unauthenticated,
    403: forbidden,
  },
});
