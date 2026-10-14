import { Router } from "express";

import { errorResponse, jsonResponse, registry, sessionSecurity } from "../../lib/openapi";
import { authenticate } from "../../middleware/authenticate";
import { requireRole } from "../../middleware/require-role";
import { getMyDashboardHandler, getTeamDashboardHandler } from "./dashboard.controller";
import {
  myDashboardQuerySchema,
  myDashboardResponseSchema,
  teamDashboardQuerySchema,
  teamDashboardResponseSchema,
} from "./dashboard.schema";

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

// Every signed-in user has a page about their own work.
dashboardRouter.get("/me", getMyDashboardHandler);
// The figures of other people are for the people who run a team (DASH-02, DASH-03), and
// for a Read-only user, who sees every record and so sees what an Admin sees.
dashboardRouter.get(
  "/team",
  requireRole("ADMIN", "SALES_MANAGER", "READ_ONLY"),
  getTeamDashboardHandler,
);

// Documented beside the routes so the two cannot drift apart.
const tags = ["Dashboard"];
const security = sessionSecurity;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");

registry.registerPath({
  method: "get",
  path: "/dashboard/me",
  tags,
  summary: "The caller's own work: open leads, pipeline by stage, tasks and follow-ups due",
  description:
    "Own means records the caller owns and tasks assigned to them, whatever their role. Today and this month are the caller's, in the time zone tz (UTC when left out).",
  security,
  request: { query: myDashboardQuerySchema },
  responses: {
    200: jsonResponse("The figures", myDashboardResponseSchema),
    400: errorResponse("VALIDATION_FAILED: tz is not a time zone"),
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "get",
  path: "/dashboard/team",
  tags,
  summary: "Figures per person for a range of days (Admin, Sales Manager and Read-only)",
  description:
    "An Admin and a Read-only user see every user who is not Read-only, a Sales Manager themselves and their team. from and to are days in the time zone tz and both are included; left out, they are the first day of the current month and today. The range is at most 366 days. openPipelineValue and overdueTasks are as of now, not of the range. A deactivated person is listed only while one of their figures is not zero.",
  security,
  request: { query: teamDashboardQuerySchema },
  responses: {
    200: jsonResponse("The range, the totals and one row per person", teamDashboardResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: bad input, a to before from, or a range of more than 366 days",
    ),
    401: unauthenticated,
    403: errorResponse("A Sales Rep (FORBIDDEN)"),
  },
});
