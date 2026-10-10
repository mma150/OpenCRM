import { Router } from "express";

import {
  errorResponse,
  jsonBody,
  jsonResponse,
  registry,
  sessionSecurity,
} from "../../lib/openapi";
import { authenticate } from "../../middleware/authenticate";
import { requireRole } from "../../middleware/require-role";
import { getOrganizationHandler, updateOrganizationHandler } from "./organization.controller";
import { organizationResponseSchema, updateOrganizationBodySchema } from "./organization.schema";

// Mounted at /settings/organization.
export const organizationRouter = Router();

organizationRouter.use(authenticate);
// Every signed-in user reads it: the details are printed on every quote and invoice, and the
// quote form shows the defaults.
organizationRouter.get("/", getOrganizationHandler);
organizationRouter.put("/", requireRole("ADMIN"), updateOrganizationHandler);

// Documented beside the routes so the two cannot drift apart.
const tags = ["Settings"];
const security = sessionSecurity;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");

registry.registerPath({
  method: "get",
  path: "/settings/organization",
  tags,
  summary: "The organisation's details and the defaults of a new quote",
  description:
    "Who the quotes and invoices are from (name, address, email, phone, tax id) and what a new quote starts with. Until an Admin saves them the name is empty, a quote is valid for 30 days, the default tax rate is 0 and an invoice is due after 30 days.",
  security,
  responses: {
    200: jsonResponse("The settings", organizationResponseSchema),
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "put",
  path: "/settings/organization",
  tags,
  summary: "Replace the organisation's details and defaults (Admin only)",
  description:
    "A text that is left out is cleared; a number that is left out goes back to its default. Quotes and invoices that exist keep their own dates, terms and tax rates.",
  security,
  request: { body: jsonBody(updateOrganizationBodySchema) },
  responses: {
    200: jsonResponse("The saved settings", organizationResponseSchema),
    400: errorResponse("The request is not acceptable (VALIDATION_FAILED)"),
    401: unauthenticated,
    403: errorResponse("Not an Admin (FORBIDDEN)"),
  },
});
