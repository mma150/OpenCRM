import { Router } from "express";

import {
  csvResponse,
  errorResponse,
  jsonBody,
  jsonResponse,
  registry,
  sessionSecurity,
} from "../../lib/openapi";
import {
  deletedResponseSchema,
  followUpBodySchema,
  recordIdParamsSchema,
} from "../../lib/record-fields";
import { CSV_EXPORT, CUSTOM_FIELD_FILTERS } from "../../lib/route-docs";
import { authenticate } from "../../middleware/authenticate";
import {
  assignLeadHandler,
  convertLeadHandler,
  createLeadHandler,
  deleteLeadHandler,
  exportLeadsHandler,
  getLeadHandler,
  listLeadsHandler,
  markLeadLostHandler,
  setLeadFollowUpHandler,
  updateLeadHandler,
} from "./leads.controller";
import {
  assignLeadBodySchema,
  convertLeadBodySchema,
  createLeadBodySchema,
  leadExportQuerySchema,
  leadListQuerySchema,
  leadListResponseSchema,
  leadResponseSchema,
  markLeadLostBodySchema,
  updateLeadBodySchema,
} from "./leads.schema";

export const leadsRouter = Router();

// Any signed-in user. Which leads each role may see and change is decided in the service
// (lib/record-access.ts), because it depends on who owns the lead.
leadsRouter.use(authenticate);

leadsRouter.get("/", listLeadsHandler);
leadsRouter.post("/", createLeadHandler);
// Above /:id, or "export" would be read as an id.
leadsRouter.get("/export", exportLeadsHandler);
leadsRouter.get("/:id", getLeadHandler);
leadsRouter.patch("/:id", updateLeadHandler);
leadsRouter.delete("/:id", deleteLeadHandler);
leadsRouter.post("/:id/mark-lost", markLeadLostHandler);
leadsRouter.post("/:id/assign", assignLeadHandler);
leadsRouter.post("/:id/convert", convertLeadHandler);
leadsRouter.put("/:id/follow-up", setLeadFollowUpHandler);

// Documented beside the routes so the two cannot drift apart.
const tags = ["Leads"];
const security = sessionSecurity;
const params = recordIdParamsSchema;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const readOnly = errorResponse("A Read-only user cannot change records (FORBIDDEN)");
const validationFailed = errorResponse("The request is not acceptable (VALIDATION_FAILED)");
const badOwner = errorResponse(
  "VALIDATION_FAILED: bad input, or an ownerId the caller may not assign leads to",
);
const notFound = errorResponse(
  "No lead has this id, or it is not one the caller may see (NOT_FOUND)",
);
const converted = errorResponse("The lead has been converted and cannot change (LEAD_CONVERTED)");

registry.registerPath({
  method: "get",
  path: "/leads",
  tags,
  summary: "List the leads the caller may see, with search, filters, sorting and paging",
  description: CUSTOM_FIELD_FILTERS,
  security,
  request: { query: leadListQuerySchema },
  responses: {
    200: jsonResponse("One page of leads; meta.total counts every match", leadListResponseSchema),
    400: validationFailed,
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "get",
  path: "/leads/export",
  tags,
  summary: "Download the leads the caller may see as a CSV file",
  description: CSV_EXPORT,
  security,
  request: { query: leadExportQuerySchema },
  responses: {
    200: csvResponse("The CSV file"),
    400: validationFailed,
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "post",
  path: "/leads",
  tags,
  summary: "Create a lead, owned by the caller unless ownerId says otherwise",
  security,
  request: { body: jsonBody(createLeadBodySchema) },
  responses: {
    201: jsonResponse("The new lead", leadResponseSchema),
    400: badOwner,
    401: unauthenticated,
    403: readOnly,
  },
});

registry.registerPath({
  method: "get",
  path: "/leads/{id}",
  tags,
  summary: "Read one lead",
  security,
  request: { params },
  responses: {
    200: jsonResponse("The lead", leadResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    404: notFound,
  },
});

registry.registerPath({
  method: "patch",
  path: "/leads/{id}",
  tags,
  summary: "Change a lead's details or move it between the open statuses",
  description:
    "Only the keys sent are changed; null clears a field that can be empty. Setting status on a lost lead reopens it and clears lostReason, lostNote and lostAt.",
  security,
  request: { params, body: jsonBody(updateLeadBodySchema) },
  responses: {
    200: jsonResponse("The updated lead", leadResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    403: readOnly,
    404: notFound,
    409: converted,
  },
});

registry.registerPath({
  method: "delete",
  path: "/leads/{id}",
  tags,
  summary: "Delete a lead (it is kept in the database but never shown again)",
  security,
  request: { params },
  responses: {
    200: jsonResponse("Deleted; data is null", deletedResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    403: readOnly,
    404: notFound,
    409: converted,
  },
});

registry.registerPath({
  method: "post",
  path: "/leads/{id}/mark-lost",
  tags,
  summary: "Mark a lead as lost, with the reason",
  security,
  request: { params, body: jsonBody(markLeadLostBodySchema) },
  responses: {
    200: jsonResponse("The lead, now LOST with lostAt set", leadResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    403: readOnly,
    404: notFound,
    409: converted,
  },
});

registry.registerPath({
  method: "post",
  path: "/leads/{id}/assign",
  tags,
  summary: "Give a lead to another owner (Admin and Sales Manager only)",
  security,
  request: { params, body: jsonBody(assignLeadBodySchema) },
  responses: {
    200: jsonResponse("The lead with its new owner", leadResponseSchema),
    400: badOwner,
    401: unauthenticated,
    403: errorResponse("Not an Admin or a Sales Manager (FORBIDDEN)"),
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/leads/{id}/convert",
  tags,
  summary: "Convert a lead into a contact, and optionally a company and an opportunity",
  description:
    "One transaction. The lead becomes CONVERTED and names what it became in convertedTo; its timeline stays on the lead. New records belong to the lead's owner, and a new contact takes the lead's name, job title, email, phone and notes. An existing contact or company is linked, not changed. A lost lead must be reopened first.",
  security,
  request: { params, body: jsonBody(convertLeadBodySchema) },
  responses: {
    200: jsonResponse("The lead, now CONVERTED with convertedTo set", leadResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: bad input, a company.id or contact.id the caller may not see, an opportunity.stageId that is not an open stage, or a lost lead (details null)",
    ),
    401: unauthenticated,
    403: readOnly,
    404: notFound,
    409: converted,
  },
});

registry.registerPath({
  method: "put",
  path: "/leads/{id}/follow-up",
  tags,
  summary: "Set, move or clear the follow-up reminder on a lead",
  description:
    "When the time comes the lead's owner gets a LEAD_FOLLOW_UP notification and, if email is on, an email; it fires once, and moving the time arms it again. at: null clears the follow-up and its note. A lost lead must be reopened before a follow-up can be set.",
  security,
  request: { params, body: jsonBody(followUpBodySchema) },
  responses: {
    200: jsonResponse("The lead with followUpAt and followUpNote as set", leadResponseSchema),
    400: errorResponse("VALIDATION_FAILED: bad input, or a lost lead (details null)"),
    401: unauthenticated,
    403: readOnly,
    404: notFound,
    409: converted,
  },
});
