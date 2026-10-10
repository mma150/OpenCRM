import { Router } from "express";

import {
  errorResponse,
  jsonBody,
  jsonResponse,
  registry,
  sessionSecurity,
} from "../../lib/openapi";
import { recordIdParamsSchema } from "../../lib/record-fields";
import { authenticate } from "../../middleware/authenticate";
import { requireRole } from "../../middleware/require-role";
import {
  createStageHandler,
  deleteStageHandler,
  listStagesHandler,
  renameStageHandler,
  reorderStagesHandler,
} from "./pipeline-stages.controller";
import {
  createPipelineStageBodySchema,
  deletePipelineStageBodySchema,
  pipelineStagesResponseSchema,
  reorderPipelineStagesBodySchema,
  updatePipelineStageBodySchema,
} from "./pipeline-stages.schema";

export const pipelineStagesRouter = Router();

pipelineStagesRouter.use(authenticate);
// Every signed-in user reads the pipeline: the board and every stage picker need it.
pipelineStagesRouter.get("/", listStagesHandler);

// Changing it is for Admins (OPP-05).
pipelineStagesRouter.use(requireRole("ADMIN"));
pipelineStagesRouter.post("/", createStageHandler);
// Above /:id, or "order" would be read as an id.
pipelineStagesRouter.put("/order", reorderStagesHandler);
pipelineStagesRouter.patch("/:id", renameStageHandler);
pipelineStagesRouter.delete("/:id", deleteStageHandler);

// Documented beside the routes so the two cannot drift apart.
const tags = ["Pipeline stages"];
const security = sessionSecurity;
const params = recordIdParamsSchema;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const notAdmin = errorResponse("Not an Admin (FORBIDDEN)");
const notFound = errorResponse("No stage has this id (NOT_FOUND)");
const pipeline = "The whole pipeline in order: the open stages, then Won, then Lost";

registry.registerPath({
  method: "get",
  path: "/pipeline-stages",
  tags,
  summary: "List the pipeline stages in order",
  description:
    "The open stages in their order, then the Won stage, then the Lost stage. opportunityCount counts the opportunities the caller may see.",
  security,
  responses: {
    200: jsonResponse(pipeline, pipelineStagesResponseSchema),
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "post",
  path: "/pipeline-stages",
  tags,
  summary: "Add an open stage, last before Won (Admin only)",
  security,
  request: { body: jsonBody(createPipelineStageBodySchema) },
  responses: {
    201: jsonResponse(pipeline, pipelineStagesResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: bad input, a name another stage already has (details name the field), or the pipeline already has 20 open stages (details null)",
    ),
    401: unauthenticated,
    403: notAdmin,
  },
});

registry.registerPath({
  method: "put",
  path: "/pipeline-stages/order",
  tags,
  summary: "Put the open stages in a new order (Admin only)",
  description: "ids must hold every open stage exactly once. Won and Lost always come last.",
  security,
  request: { body: jsonBody(reorderPipelineStagesBodySchema) },
  responses: {
    200: jsonResponse(pipeline, pipelineStagesResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: bad input, or ids that are not every open stage exactly once",
    ),
    401: unauthenticated,
    403: notAdmin,
  },
});

registry.registerPath({
  method: "patch",
  path: "/pipeline-stages/{id}",
  tags,
  summary: "Rename a stage, Won and Lost included (Admin only)",
  security,
  request: { params, body: jsonBody(updatePipelineStageBodySchema) },
  responses: {
    200: jsonResponse(pipeline, pipelineStagesResponseSchema),
    400: errorResponse("VALIDATION_FAILED: bad input, or a name another stage already has"),
    401: unauthenticated,
    403: notAdmin,
    404: notFound,
  },
});

registry.registerPath({
  method: "delete",
  path: "/pipeline-stages/{id}",
  tags,
  summary: "Delete an open stage, moving its opportunities to another (Admin only)",
  description:
    "The Won and Lost stages and the last open stage cannot be deleted. A stage that holds opportunities needs moveToStageId, another open stage; each moved opportunity gets a STATUS_CHANGE entry on its timeline. The body may be left out for an empty stage.",
  security,
  request: {
    params,
    body: {
      required: false,
      content: { "application/json": { schema: deletePipelineStageBodySchema } },
    },
  },
  responses: {
    200: jsonResponse(pipeline, pipelineStagesResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: the stage holds opportunities and moveToStageId is missing or is not another open stage (details name moveToStageId), or it is the Won, Lost or last open stage (details null)",
    ),
    401: unauthenticated,
    403: notAdmin,
    404: notFound,
  },
});
