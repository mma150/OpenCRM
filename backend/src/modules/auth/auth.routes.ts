import { Router } from "express";

import {
  errorResponse,
  jsonBody,
  jsonResponse,
  registry,
  sessionSecurity,
} from "../../lib/openapi";
import { authenticate } from "../../middleware/authenticate";
import type { AuthLimiters } from "../../middleware/rate-limit";
import {
  acceptInviteHandler,
  changePasswordHandler,
  forgotPasswordHandler,
  getMeHandler,
  getSetupStatusHandler,
  inviteInfoHandler,
  loginHandler,
  logoutHandler,
  resetPasswordHandler,
  setupHandler,
  updateMeHandler,
} from "./auth.controller";
import {
  acceptInviteBodySchema,
  changePasswordBodySchema,
  emptyResponseSchema,
  forgotPasswordBodySchema,
  inviteInfoBodySchema,
  inviteInfoResponseSchema,
  loginBodySchema,
  meResponseSchema,
  resetPasswordBodySchema,
  setupBodySchema,
  setupStatusResponseSchema,
  updateProfileBodySchema,
} from "./auth.schema";

// A function, not a constant, because the rate limiters belong to one app instance
// (tests build apps with their own limits).
export function createAuthRouter(limiters: AuthLimiters) {
  const router = Router();

  // Public routes, each behind a rate limiter.
  router.get("/setup-status", limiters.status, getSetupStatusHandler);
  router.post("/setup", limiters.publicIp, setupHandler);
  router.post("/login", limiters.loginIp, limiters.loginEmail, loginHandler);
  router.post("/forgot-password", limiters.publicIp, limiters.forgotEmail, forgotPasswordHandler);
  router.post("/reset-password", limiters.publicIp, resetPasswordHandler);
  router.post("/invite-info", limiters.publicIp, inviteInfoHandler);
  router.post("/accept-invite", limiters.publicIp, acceptInviteHandler);

  // Signed-in routes.
  router.get("/me", authenticate, getMeHandler);
  router.patch("/me", authenticate, updateMeHandler);
  router.post("/change-password", authenticate, changePasswordHandler);
  router.post("/logout", authenticate, logoutHandler);

  return router;
}

// Documented beside the routes so the two cannot drift apart.
const tags = ["Auth"];
const rateLimited = errorResponse("Too many attempts (RATE_LIMITED, details.retryAfterSeconds)");
const validationFailed = errorResponse("The request is not acceptable (VALIDATION_FAILED)");
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const invalidToken = errorResponse(
  "VALIDATION_FAILED, or the link is unknown, used or expired (INVALID_TOKEN)",
);

registry.registerPath({
  method: "get",
  path: "/auth/setup-status",
  tags,
  summary: "Whether the first Admin account still has to be created",
  responses: {
    200: jsonResponse("True while no user exists", setupStatusResponseSchema),
    429: rateLimited,
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/setup",
  tags,
  summary: "Create the first Admin account and sign in (first run only)",
  request: { body: jsonBody(setupBodySchema) },
  responses: {
    201: jsonResponse("The Admin was created; the session cookie is set", meResponseSchema),
    400: validationFailed,
    409: errorResponse("A user already exists (SETUP_CLOSED)"),
    429: rateLimited,
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/login",
  tags,
  summary: "Sign in with email and password",
  request: { body: jsonBody(loginBodySchema) },
  responses: {
    200: jsonResponse("Signed in; the session cookie is set", meResponseSchema),
    400: validationFailed,
    401: errorResponse("Wrong email or password (INVALID_CREDENTIALS)"),
    403: errorResponse("Right password, but the account is deactivated (ACCOUNT_DEACTIVATED)"),
    423: errorResponse("Too many wrong passwords (ACCOUNT_LOCKED, details.retryAfterSeconds)"),
    429: rateLimited,
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/forgot-password",
  tags,
  summary: "Ask for a password-reset link by email",
  request: { body: jsonBody(forgotPasswordBodySchema) },
  responses: {
    200: jsonResponse("Always, whether or not the email has an account", emptyResponseSchema),
    400: validationFailed,
    429: rateLimited,
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/reset-password",
  tags,
  summary: "Choose a new password with a reset link; ends every session of the user",
  request: { body: jsonBody(resetPasswordBodySchema) },
  responses: {
    200: jsonResponse("The password was changed; sign in with it", emptyResponseSchema),
    400: invalidToken,
    429: rateLimited,
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/invite-info",
  tags,
  summary: "Who an invite link is for",
  request: { body: jsonBody(inviteInfoBodySchema) },
  responses: {
    200: jsonResponse("The invited person", inviteInfoResponseSchema),
    400: invalidToken,
    429: rateLimited,
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/accept-invite",
  tags,
  summary: "Choose a password with an invite link and sign in",
  request: { body: jsonBody(acceptInviteBodySchema) },
  responses: {
    200: jsonResponse("Signed in; the session cookie is set", meResponseSchema),
    400: invalidToken,
    429: rateLimited,
  },
});

registry.registerPath({
  method: "get",
  path: "/auth/me",
  tags,
  summary: "The signed-in user",
  security: sessionSecurity,
  responses: {
    200: jsonResponse("The signed-in user", meResponseSchema),
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "patch",
  path: "/auth/me",
  tags,
  summary: "Change your own name",
  security: sessionSecurity,
  request: { body: jsonBody(updateProfileBodySchema) },
  responses: {
    200: jsonResponse("The updated user", meResponseSchema),
    400: validationFailed,
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/change-password",
  tags,
  summary: "Change your own password; keeps this session and ends your others",
  security: sessionSecurity,
  request: { body: jsonBody(changePasswordBodySchema) },
  responses: {
    200: jsonResponse("The password was changed", emptyResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED; a wrong current password is reported on the path currentPassword",
    ),
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/logout",
  tags,
  summary: "Sign out of this session and clear the cookie",
  security: sessionSecurity,
  responses: {
    200: jsonResponse("Signed out", emptyResponseSchema),
    401: unauthenticated,
  },
});
