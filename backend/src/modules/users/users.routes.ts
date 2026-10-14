import { Router } from "express";

import {
  csvResponse,
  errorResponse,
  jsonBody,
  jsonResponse,
  registry,
  sessionSecurity,
} from "../../lib/openapi";
import { authenticate } from "../../middleware/authenticate";
import { requireRole } from "../../middleware/require-role";
import {
  createUserHandler,
  deactivateUserHandler,
  exportUsersHandler,
  listAssignableUsersHandler,
  listUsersHandler,
  passwordResetLinkHandler,
  reactivateUserHandler,
  resendInviteHandler,
  updateUserHandler,
} from "./users.controller";
import {
  assignableUsersResponseSchema,
  createUserBodySchema,
  createUserResponseSchema,
  linkResultResponseSchema,
  updateUserBodySchema,
  updateUserResponseSchema,
  userExportQuerySchema,
  userIdParamsSchema,
  userListResponseSchema,
  userResponseSchema,
} from "./users.schema";

export const usersRouter = Router();

usersRouter.use(authenticate);

// For any signed-in user, so it must stay above the Admin guard and the /:id routes.
usersRouter.get("/assignable", listAssignableUsersHandler);

// Every route below is for Admins only.
usersRouter.use(requireRole("ADMIN"));

usersRouter.get("/", listUsersHandler);
usersRouter.get("/export", exportUsersHandler);
usersRouter.post("/", createUserHandler);
usersRouter.patch("/:id", updateUserHandler);
usersRouter.post("/:id/deactivate", deactivateUserHandler);
usersRouter.post("/:id/reactivate", reactivateUserHandler);
usersRouter.post("/:id/resend-invite", resendInviteHandler);
usersRouter.post("/:id/password-reset-link", passwordResetLinkHandler);

// Documented beside the routes so the two cannot drift apart.
const tags = ["Users"];
const security = sessionSecurity;
const params = userIdParamsSchema;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const forbidden = errorResponse("Not an Admin (FORBIDDEN)");
const validationFailed = errorResponse("The request is not acceptable (VALIDATION_FAILED)");
const notFound = errorResponse("No user has this id (NOT_FOUND)");

registry.registerPath({
  method: "get",
  path: "/users",
  tags,
  summary: "List every user (Admin only)",
  security,
  responses: {
    200: jsonResponse(
      "All users; meta.mailEnabled says whether email works",
      userListResponseSchema,
    ),
    401: unauthenticated,
    403: forbidden,
  },
});

registry.registerPath({
  method: "get",
  path: "/users/export",
  tags,
  summary: "Download every user as a CSV file (Admin only)",
  description:
    "The users list as a file, in its order (by name), deactivated users included: Name, Email, Role, Status, Manager, Created. Never a password hash, a token, a session or sign-in lock data. UTF-8 with a byte order mark, one header row, CRLF line ends. Times are written as YYYY-MM-DD HH:mm in the time zone tz (UTC when left out), and the file is named users-YYYY-MM-DD.csv after the viewer's today. At most 10,000 rows (X-Export-Truncated says when the list was longer). A text cell that starts with =, +, -, @, a tab or a carriage return gets a leading apostrophe, so no spreadsheet runs it as a formula.",
  security,
  request: { query: userExportQuerySchema },
  responses: {
    200: csvResponse("The CSV file"),
    400: validationFailed,
    401: unauthenticated,
    403: forbidden,
  },
});

registry.registerPath({
  method: "get",
  path: "/users/assignable",
  tags,
  summary: "List the users the caller may assign records to (any signed-in user)",
  description:
    "Admin: every active Admin, Sales Manager and Sales Rep. Sales Manager: themselves and their active reps. Sales Rep: themselves. Read-only: nobody.",
  security,
  responses: {
    200: jsonResponse("The possible owners, by name", assignableUsersResponseSchema),
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "post",
  path: "/users",
  tags,
  summary: "Invite a user (Admin only)",
  security,
  request: { body: jsonBody(createUserBodySchema) },
  responses: {
    201: jsonResponse(
      "The invited user, and the invite link when it was not emailed",
      createUserResponseSchema,
    ),
    400: validationFailed,
    401: unauthenticated,
    403: forbidden,
    409: errorResponse("Another user has this email (EMAIL_IN_USE)"),
  },
});

registry.registerPath({
  method: "patch",
  path: "/users/{id}",
  tags,
  summary: "Change a user's name, email, role or manager (Admin only)",
  security,
  request: { params, body: jsonBody(updateUserBodySchema) },
  responses: {
    200: jsonResponse(
      "The updated user; meta.reassignedReports counts reps who lost this manager",
      updateUserResponseSchema,
    ),
    400: validationFailed,
    401: unauthenticated,
    403: forbidden,
    404: notFound,
    409: errorResponse(
      "Another user has this email (EMAIL_IN_USE), or no Admin would be left (LAST_ADMIN)",
    ),
  },
});

registry.registerPath({
  method: "post",
  path: "/users/{id}/deactivate",
  tags,
  summary: "Deactivate a user and end their sessions (Admin only)",
  security,
  request: { params },
  responses: {
    200: jsonResponse("The deactivated user", userResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    403: errorResponse("Not an Admin, or an Admin deactivating their own account (FORBIDDEN)"),
    404: notFound,
    409: errorResponse("No Admin would be left (LAST_ADMIN)"),
  },
});

registry.registerPath({
  method: "post",
  path: "/users/{id}/reactivate",
  tags,
  summary: "Reactivate a user with the same role and manager (Admin only)",
  security,
  request: { params },
  responses: {
    200: jsonResponse("The reactivated user", userResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    403: forbidden,
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/users/{id}/resend-invite",
  tags,
  summary: "Send a new invite link and cancel the earlier one (Admin only)",
  security,
  request: { params },
  responses: {
    200: jsonResponse("Whether the link was emailed, or the link itself", linkResultResponseSchema),
    400: errorResponse("VALIDATION_FAILED: bad id, or the user is not waiting on an invite"),
    401: unauthenticated,
    403: forbidden,
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/users/{id}/password-reset-link",
  tags,
  summary: "Make a password-reset link for a user (Admin only)",
  security,
  request: { params },
  responses: {
    200: jsonResponse("Whether the link was emailed, or the link itself", linkResultResponseSchema),
    400: errorResponse("VALIDATION_FAILED: bad id, or the user is not active with a password"),
    401: unauthenticated,
    403: forbidden,
    404: notFound,
  },
});
