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
import { requireRole } from "../../middleware/require-role";
import {
  deleteEmailSettingsHandler,
  getEmailSettingsHandler,
  getEmailStatusHandler,
  saveEmailSettingsHandler,
  sendTestEmailHandler,
} from "./email-settings.controller";
import {
  emailSettingsResponseSchema,
  emailStatusResponseSchema,
  testEmailBodySchema,
  testEmailResponseSchema,
  updateEmailSettingsBodySchema,
} from "./email-settings.schema";

// Mounted at /settings/email.
export function createEmailSettingsRouter(limiters: AuthLimiters) {
  const router = Router();

  router.use(authenticate);
  // Every signed-in user may know whether email works: the "Send email" buttons depend on it.
  router.get("/status", getEmailStatusHandler);

  // The settings themselves are for Admins (MAIL-01).
  router.use(requireRole("ADMIN"));
  router.get("/", getEmailSettingsHandler);
  router.put("/", saveEmailSettingsHandler);
  router.delete("/", deleteEmailSettingsHandler);
  router.post("/test", limiters.sendEmail, sendTestEmailHandler);

  return router;
}

// Documented beside the routes so the two cannot drift apart.
const tags = ["Settings"];
const security = sessionSecurity;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const notAdmin = errorResponse("Not an Admin (FORBIDDEN)");

registry.registerPath({
  method: "get",
  path: "/settings/email/status",
  tags,
  summary: "Whether outgoing email is on",
  description:
    "For every signed-in user. true when an Admin saved a mail server here or the SMTP_* environment variables name one.",
  security,
  responses: {
    200: jsonResponse("Whether email is on", emailStatusResponseSchema),
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "get",
  path: "/settings/email",
  tags,
  summary: "The outgoing mail server in effect (Admin only)",
  description:
    "What was saved here, or else what the SMTP_* environment variables say, or else source NONE. The password is never returned, only hasPassword.",
  security,
  responses: {
    200: jsonResponse("The settings in effect", emailSettingsResponseSchema),
    401: unauthenticated,
    403: notAdmin,
  },
});

registry.registerPath({
  method: "put",
  path: "/settings/email",
  tags,
  summary: "Save the outgoing mail server (Admin only)",
  description:
    "Replaces what was saved and wins over the SMTP_* environment variables from the next email on. password left out keeps the stored one, null removes it; removing the username removes the password too. The password is stored encrypted (AES-256-GCM); without SETTINGS_ENCRYPTION_KEY on the server a password is refused. Nothing is sent: use the test route afterwards.",
  security,
  request: { body: jsonBody(updateEmailSettingsBodySchema) },
  responses: {
    200: jsonResponse("The saved settings", emailSettingsResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: bad input, or a password without a username (details name username)",
    ),
    401: unauthenticated,
    403: notAdmin,
    409: errorResponse(
      "ENCRYPTION_KEY_MISSING: a password was sent but the server has no SETTINGS_ENCRYPTION_KEY; nothing was saved",
    ),
  },
});

registry.registerPath({
  method: "delete",
  path: "/settings/email",
  tags,
  summary: "Forget the saved mail server (Admin only)",
  description:
    "Goes back to the SMTP_* environment variables, or to no email when they name no server. Answers with the settings then in effect.",
  security,
  responses: {
    200: jsonResponse("The settings in effect now", emailSettingsResponseSchema),
    401: unauthenticated,
    403: notAdmin,
  },
});

registry.registerPath({
  method: "post",
  path: "/settings/email/test",
  tags,
  summary: "Send a test email with the settings in effect (Admin only)",
  description:
    "Waits for the mail server's answer. A failure says what kind of problem it was (connection, time-out, login, encryption, refused address) and the SMTP status number, never the mail server's own text. Counts towards the caller's email sending limit.",
  security,
  request: { body: jsonBody(testEmailBodySchema) },
  responses: {
    200: jsonResponse("The mail server accepted the message", testEmailResponseSchema),
    400: errorResponse("The request is not acceptable (VALIDATION_FAILED)"),
    401: unauthenticated,
    403: notAdmin,
    409: errorResponse("EMAIL_NOT_CONFIGURED: no mail server is set up"),
    429: errorResponse("RATE_LIMITED: too many emails in a short time"),
    502: errorResponse("EMAIL_SEND_FAILED: the mail server could not be reached or refused"),
  },
});
