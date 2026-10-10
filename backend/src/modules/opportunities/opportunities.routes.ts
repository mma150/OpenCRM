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
  assignOpportunityHandler,
  closeOpportunityHandler,
  createOpportunityHandler,
  deleteOpportunityHandler,
  getBoardHandler,
  getOpportunityHandler,
  listOpportunitiesHandler,
  moveOpportunityHandler,
  reopenOpportunityHandler,
  updateOpportunityHandler,
} from "./opportunities.controller";
import {
  assignOpportunityBodySchema,
  boardQuerySchema,
  boardResponseSchema,
  closeOpportunityBodySchema,
  createOpportunityBodySchema,
  moveOpportunityBodySchema,
  opportunityListQuerySchema,
  opportunityListResponseSchema,
  opportunityResponseSchema,
  reopenOpportunityBodySchema,
  updateOpportunityBodySchema,
} from "./opportunities.schema";

export const opportunitiesRouter = Router();

// Any signed-in user. Which opportunities each role may see and change is decided in the
// service (lib/record-access.ts), because it depends on who owns the opportunity.
opportunitiesRouter.use(authenticate);

opportunitiesRouter.get("/", listOpportunitiesHandler);
opportunitiesRouter.post("/", createOpportunityHandler);
// Above /:id, or "board" would be read as an id.
opportunitiesRouter.get("/board", getBoardHandler);
opportunitiesRouter.get("/:id", getOpportunityHandler);
opportunitiesRouter.patch("/:id", updateOpportunityHandler);
opportunitiesRouter.delete("/:id", deleteOpportunityHandler);
opportunitiesRouter.post("/:id/stage", moveOpportunityHandler);
opportunitiesRouter.post("/:id/close", closeOpportunityHandler);
opportunitiesRouter.post("/:id/reopen", reopenOpportunityHandler);
opportunitiesRouter.post("/:id/assign", assignOpportunityHandler);

// Documented beside the routes so the two cannot drift apart.
const tags = ["Opportunities"];
const security = sessionSecurity;
const params = recordIdParamsSchema;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const readOnly = errorResponse("A Read-only user cannot change records (FORBIDDEN)");
const validationFailed = errorResponse("The request is not acceptable (VALIDATION_FAILED)");
const badLink = errorResponse(
  "VALIDATION_FAILED: bad input, or a contactId or companyId that is not a record the caller may see",
);
const badStage = errorResponse(
  "VALIDATION_FAILED: bad input, or a stageId that is not an open stage",
);
const notFound = errorResponse(
  "No opportunity has this id, or it is not one the caller may see (NOT_FOUND)",
);

registry.registerPath({
  method: "get",
  path: "/opportunities",
  tags,
  summary: "List the opportunities the caller may see, with search, filters, sorting and paging",
  description:
    "search matches the opportunity's name, its company's name and its contact's name. Newest first unless asked otherwise; sort=stage follows the pipeline (open stages, Won, Lost), and an opportunity without an expected close date sorts last.",
  security,
  request: { query: opportunityListQuerySchema },
  responses: {
    200: jsonResponse(
      "One page of opportunities; meta.total counts every match",
      opportunityListResponseSchema,
    ),
    400: validationFailed,
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "get",
  path: "/opportunities/board",
  tags,
  summary: "The pipeline as columns: every stage in order with its opportunities",
  description:
    "One column for each stage, Won and Lost included, in pipeline order. count and totalValue cover every matching opportunity in the stage; opportunities holds at most 50 of them, the most recently changed first.",
  security,
  request: { query: boardQuerySchema },
  responses: {
    200: jsonResponse("The columns in pipeline order", boardResponseSchema),
    400: validationFailed,
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "post",
  path: "/opportunities",
  tags,
  summary: "Create an opportunity, owned by the caller unless ownerId says otherwise",
  description: "It starts in the first open stage unless stageId names another open stage.",
  security,
  request: { body: jsonBody(createOpportunityBodySchema) },
  responses: {
    201: jsonResponse("The new opportunity", opportunityResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: bad input, an ownerId the caller may not assign opportunities to, a contactId or companyId the caller may not see, or a stageId that is not an open stage",
    ),
    401: unauthenticated,
    403: readOnly,
  },
});

registry.registerPath({
  method: "get",
  path: "/opportunities/{id}",
  tags,
  summary: "Read one opportunity",
  security,
  request: { params },
  responses: {
    200: jsonResponse("The opportunity", opportunityResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    404: notFound,
  },
});

registry.registerPath({
  method: "patch",
  path: "/opportunities/{id}",
  tags,
  summary: "Change an opportunity's details",
  description:
    "Only the keys sent are changed; null clears a field that can be empty. The stage and the owner have their own routes.",
  security,
  request: { params, body: jsonBody(updateOpportunityBodySchema) },
  responses: {
    200: jsonResponse("The updated opportunity", opportunityResponseSchema),
    400: badLink,
    401: unauthenticated,
    403: readOnly,
    404: notFound,
  },
});

registry.registerPath({
  method: "delete",
  path: "/opportunities/{id}",
  tags,
  summary: "Delete an opportunity (it is kept in the database but never shown again)",
  security,
  request: { params },
  responses: {
    200: jsonResponse("Deleted; data is null", deletedResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    403: readOnly,
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/opportunities/{id}/stage",
  tags,
  summary: "Move an opportunity to an open stage",
  description:
    "The Won and Lost stages are refused here: use close, which records the reason. Moving a won or lost opportunity to an open stage reopens it and clears closeReason and closedAt.",
  security,
  request: { params, body: jsonBody(moveOpportunityBodySchema) },
  responses: {
    200: jsonResponse("The opportunity in its new stage", opportunityResponseSchema),
    400: badStage,
    401: unauthenticated,
    403: readOnly,
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/opportunities/{id}/close",
  tags,
  summary: "Close an opportunity as won or lost",
  description:
    "Moves it to the Won or Lost stage and sets closeReason and closedAt. reason is needed for LOST and optional for WON.",
  security,
  request: { params, body: jsonBody(closeOpportunityBodySchema) },
  responses: {
    200: jsonResponse("The opportunity, now WON or LOST", opportunityResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    403: readOnly,
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/opportunities/{id}/reopen",
  tags,
  summary: "Reopen a won or lost opportunity",
  description:
    "Moves it back to stageId, or to the first open stage, and clears closeReason and closedAt. The body may be left out.",
  security,
  request: {
    params,
    body: {
      required: false,
      content: { "application/json": { schema: reopenOpportunityBodySchema } },
    },
  },
  responses: {
    200: jsonResponse("The opportunity, open again", opportunityResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: bad input, a stageId that is not an open stage, or an opportunity that is already open (details null)",
    ),
    401: unauthenticated,
    403: readOnly,
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/opportunities/{id}/assign",
  tags,
  summary: "Give an opportunity to another owner (Admin and Sales Manager only)",
  security,
  request: { params, body: jsonBody(assignOpportunityBodySchema) },
  responses: {
    200: jsonResponse("The opportunity with its new owner", opportunityResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: bad input, or an ownerId the caller may not assign opportunities to",
    ),
    401: unauthenticated,
    403: errorResponse("Not an Admin or a Sales Manager (FORBIDDEN)"),
    404: notFound,
  },
});
