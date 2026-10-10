import { Router } from "express";

import {
  envelope,
  errorResponse,
  jsonBody,
  jsonResponse,
  registry,
  sessionSecurity,
} from "../../lib/openapi";
import { timelineEntrySchema } from "../../lib/timeline";
import { authenticate } from "../../middleware/authenticate";
import type { AuthLimiters } from "../../middleware/rate-limit";
import {
  getEmailDefaultsHandler,
  previewEmailHandler,
  sendEmailHandler,
} from "./emails.controller";
import {
  emailDefaultsQuerySchema,
  emailDefaultsResponseSchema,
  emailPreviewResponseSchema,
  previewEmailBodySchema,
  sendEmailBodySchema,
} from "./emails.schema";

export function createEmailsRouter(limiters: AuthLimiters) {
  const router = Router();

  // Any signed-in user. Which records each one may send from is decided in the service: it
  // follows the record, like a conversation.
  router.use(authenticate);

  router.get("/defaults", getEmailDefaultsHandler);
  router.post("/preview", previewEmailHandler);
  // After authenticate: the limit is counted per user.
  router.post("/", limiters.sendEmail, sendEmailHandler);

  return router;
}

// Documented beside the routes so the two cannot drift apart.
const tags = ["Emails"];
const security = sessionSecurity;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const notFound = errorResponse(
  "No record of this type has this id, or it is not one the caller may see (NOT_FOUND)",
);

registry.registerPath({
  method: "get",
  path: "/emails/defaults",
  tags,
  summary: "Who an email from this record would usually go to",
  description:
    "For the send form to offer: a lead's own address, a contact's, the contacts of a company that have an address, an opportunity's contact. Only people the caller may see.",
  security,
  request: { query: emailDefaultsQuerySchema },
  responses: {
    200: jsonResponse("The suggested recipients", emailDefaultsResponseSchema),
    400: errorResponse("The request is not acceptable (VALIDATION_FAILED)"),
    401: unauthenticated,
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/emails/preview",
  tags,
  summary: "Fill in the placeholders of a subject and a body without sending",
  description:
    "Answers with the text as it would be sent from this record by the caller, and lists the placeholders that are not supported (left as typed) and those the record has no value for (replaced by nothing). quote.number and quote.total are always empty here: they are only known when a quote is sent.",
  security,
  request: { body: jsonBody(previewEmailBodySchema) },
  responses: {
    200: jsonResponse("The text with its placeholders filled in", emailPreviewResponseSchema),
    400: errorResponse("The request is not acceptable (VALIDATION_FAILED)"),
    401: unauthenticated,
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/emails",
  tags,
  summary: "Send an email from a record",
  description:
    "Sent through the organisation's mail server as plain text: From is the configured address under the caller's name, Reply-To is the caller's own address. Placeholders in the subject and the body are filled in first. When the mail server has accepted it, an EMAIL entry is written on the record's timeline (body: the text; details: to, cc, subject, status SENT, templateId, quote null) and the record's lastContactAt moves, as for a conversation. When sending fails nothing is written. At most 10 addresses in to and 10 in cc; an address in both is sent once. No attachments.",
  security,
  request: { body: jsonBody(sendEmailBodySchema) },
  responses: {
    201: jsonResponse("The timeline entry of the email", envelope(timelineEntrySchema)),
    400: errorResponse(
      "VALIDATION_FAILED: bad input, or a templateId that is not a template the caller may see",
    ),
    401: unauthenticated,
    403: errorResponse("A Read-only user cannot send email (FORBIDDEN)"),
    404: notFound,
    409: errorResponse("EMAIL_NOT_CONFIGURED: no mail server is set up"),
    429: errorResponse(
      "RATE_LIMITED: more than 30 emails in 5 minutes; details.retryAfterSeconds says when to try again",
    ),
    502: errorResponse(
      "EMAIL_SEND_FAILED: the mail server could not be reached or refused the message; nothing was written on the timeline",
    ),
  },
});
