import { Router } from "express";

import { errorResponse, jsonResponse, registry, sessionSecurity } from "../../lib/openapi";
import { recordIdParamsSchema } from "../../lib/record-fields";
import { authenticate } from "../../middleware/authenticate";
import {
  countUnreadHandler,
  listNotificationsHandler,
  markAllReadHandler,
  markReadHandler,
} from "./notifications.controller";
import {
  markedReadResponseSchema,
  notificationListQuerySchema,
  notificationListResponseSchema,
  notificationResponseSchema,
  unreadCountResponseSchema,
} from "./notifications.schema";

export const notificationsRouter = Router();

// Any signed-in user, and only ever their own notifications. Marking one as read is not a
// change to a record, so a Read-only user may do it too.
notificationsRouter.use(authenticate);

notificationsRouter.get("/", listNotificationsHandler);
notificationsRouter.get("/unread-count", countUnreadHandler);
notificationsRouter.post("/read-all", markAllReadHandler);
notificationsRouter.post("/:id/read", markReadHandler);

// Documented beside the routes so the two cannot drift apart.
const tags = ["Notifications"];
const security = sessionSecurity;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const validationFailed = errorResponse("The request is not acceptable (VALIDATION_FAILED)");

registry.registerPath({
  method: "get",
  path: "/notifications",
  tags,
  summary: "List the caller's own notifications, newest first",
  description: "unread=true leaves out the ones already read.",
  security,
  request: { query: notificationListQuerySchema },
  responses: {
    200: jsonResponse(
      "One page of notifications; meta.total counts every match",
      notificationListResponseSchema,
    ),
    400: validationFailed,
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "get",
  path: "/notifications/unread-count",
  tags,
  summary: "How many of the caller's notifications are unread",
  security,
  responses: {
    200: jsonResponse("The count", unreadCountResponseSchema),
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "post",
  path: "/notifications/read-all",
  tags,
  summary: "Mark every one of the caller's notifications as read",
  security,
  responses: {
    200: jsonResponse("How many were marked", markedReadResponseSchema),
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "post",
  path: "/notifications/{id}/read",
  tags,
  summary: "Mark one notification as read",
  description: "One that is already read is answered as it is.",
  security,
  request: { params: recordIdParamsSchema },
  responses: {
    200: jsonResponse("The notification with readAt set", notificationResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    404: errorResponse("No notification of the caller has this id (NOT_FOUND)"),
  },
});
