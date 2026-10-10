import { Router } from "express";

import {
  errorResponse,
  jsonBody,
  jsonResponse,
  registry,
  sessionSecurity,
} from "../../lib/openapi";
import { deletedResponseSchema, recordIdParamsSchema } from "../../lib/record-fields";
import { authenticate } from "../../middleware/authenticate";
import {
  createTemplateHandler,
  deleteTemplateHandler,
  getTemplateHandler,
  listPlaceholdersHandler,
  listTemplatesHandler,
  updateTemplateHandler,
} from "./email-templates.controller";
import {
  createEmailTemplateBodySchema,
  emailTemplateResponseSchema,
  emailTemplatesResponseSchema,
  placeholdersResponseSchema,
  updateEmailTemplateBodySchema,
} from "./email-templates.schema";

export const emailTemplatesRouter = Router();

// Any signed-in user. Whose templates each one sees and changes is decided in the service.
emailTemplatesRouter.use(authenticate);

emailTemplatesRouter.get("/", listTemplatesHandler);
emailTemplatesRouter.post("/", createTemplateHandler);
// Above /:id, or "placeholders" would be read as an id.
emailTemplatesRouter.get("/placeholders", listPlaceholdersHandler);
emailTemplatesRouter.get("/:id", getTemplateHandler);
emailTemplatesRouter.patch("/:id", updateTemplateHandler);
emailTemplatesRouter.delete("/:id", deleteTemplateHandler);

// Documented beside the routes so the two cannot drift apart.
const tags = ["Email templates"];
const security = sessionSecurity;
const params = recordIdParamsSchema;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const notFound = errorResponse(
  "No template has this id, or it is another user's private template (NOT_FOUND)",
);
const forbidden = errorResponse(
  "FORBIDDEN: a Read-only user, sharing without being an Admin or a Sales Manager, or changing a shared template of someone else without being an Admin",
);

registry.registerPath({
  method: "get",
  path: "/email-templates",
  tags,
  summary: "List the caller's own templates and every shared one, by name",
  description: "Not paged: a user owns at most 200 templates.",
  security,
  responses: {
    200: jsonResponse("The templates", emailTemplatesResponseSchema),
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "get",
  path: "/email-templates/placeholders",
  tags,
  summary: "The placeholders a subject or a body may use",
  description:
    "Written as {{contact.firstName}}. They are filled in on the server when the email is sent: a placeholder that is not on this list stays in the text as typed, and one the record has no value for is replaced by nothing. POST /emails/preview shows the result before sending.",
  security,
  responses: {
    200: jsonResponse("The supported placeholders", placeholdersResponseSchema),
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "post",
  path: "/email-templates",
  tags,
  summary: "Create a template, owned by the caller",
  security,
  request: { body: jsonBody(createEmailTemplateBodySchema) },
  responses: {
    201: jsonResponse("The new template", emailTemplateResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: bad input, a name the caller already uses (details name the field), or the caller already has 200 templates (details null)",
    ),
    401: unauthenticated,
    403: forbidden,
  },
});

registry.registerPath({
  method: "get",
  path: "/email-templates/{id}",
  tags,
  summary: "Get one template",
  security,
  request: { params },
  responses: {
    200: jsonResponse("The template", emailTemplateResponseSchema),
    401: unauthenticated,
    404: notFound,
  },
});

registry.registerPath({
  method: "patch",
  path: "/email-templates/{id}",
  tags,
  summary: "Change a template",
  description:
    "Its owner may change it; an Admin may also change any shared one. Only the keys sent are changed.",
  security,
  request: { params, body: jsonBody(updateEmailTemplateBodySchema) },
  responses: {
    200: jsonResponse("The changed template", emailTemplateResponseSchema),
    400: errorResponse("VALIDATION_FAILED: bad input, or a name its owner already uses"),
    401: unauthenticated,
    403: forbidden,
    404: notFound,
  },
});

registry.registerPath({
  method: "delete",
  path: "/email-templates/{id}",
  tags,
  summary: "Delete a template",
  description: "Its owner, or an Admin for a shared one. Emails already sent keep their text.",
  security,
  request: { params },
  responses: {
    200: jsonResponse("Deleted", deletedResponseSchema),
    401: unauthenticated,
    403: forbidden,
    404: notFound,
  },
});
