import { Router } from "express";

import { buildOpenApiDocument } from "./lib/openapi";
import type { AuthLimiters } from "./middleware/rate-limit";
import { activityRouter } from "./modules/activity/activity.routes";
import { createAuthRouter } from "./modules/auth/auth.routes";
import { companiesRouter } from "./modules/companies/companies.routes";
import { contactsRouter } from "./modules/contacts/contacts.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { healthRouter } from "./modules/health/health.routes";
import { leadsRouter } from "./modules/leads/leads.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { opportunitiesRouter } from "./modules/opportunities/opportunities.routes";
import { pipelineStagesRouter } from "./modules/pipeline-stages/pipeline-stages.routes";
import { tasksRouter } from "./modules/tasks/tasks.routes";
import { timelineRouter } from "./modules/timeline/timeline.routes";
import { usersRouter } from "./modules/users/users.routes";

// Mounted by createApp at /api/v1. Every module's router is added here.
export function createV1Router(limiters: AuthLimiters) {
  const router = Router();

  // The one response that is not wrapped in { data, meta }: OpenAPI tools need the bare
  // document. It is also the only response a browser or proxy may cache.
  router.get("/openapi.json", (_req, res) => {
    res.json(buildOpenApiDocument());
  });

  // Everything else may hold a signed-in user's data, so it is never stored or reused.
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.use("/health", healthRouter);
  router.use("/auth", createAuthRouter(limiters));
  router.use("/users", usersRouter);
  // Before the record routers: /leads/:id/timeline and its siblings belong to the timeline.
  router.use(timelineRouter);
  router.use("/leads", leadsRouter);
  router.use("/contacts", contactsRouter);
  router.use("/companies", companiesRouter);
  router.use("/pipeline-stages", pipelineStagesRouter);
  router.use("/opportunities", opportunitiesRouter);
  router.use("/activity", activityRouter);
  router.use("/tasks", tasksRouter);
  router.use("/notifications", notificationsRouter);
  router.use("/dashboard", dashboardRouter);

  return router;
}
