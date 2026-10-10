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
import { requireRole } from "../../middleware/require-role";
import {
  archiveCustomFieldHandler,
  createCustomFieldHandler,
  deleteCustomFieldHandler,
  listCustomFieldsHandler,
  reorderCustomFieldsHandler,
  restoreCustomFieldHandler,
  updateCustomFieldHandler,
} from "./custom-fields.controller";
import {
  createCustomFieldBodySchema,
  customFieldListQuerySchema,
  customFieldListResponseSchema,
  customFieldResponseSchema,
  reorderCustomFieldsBodySchema,
  updateCustomFieldBodySchema,
} from "./custom-fields.schema";

export const customFieldsRouter = Router();

customFieldsRouter.use(authenticate);
// Every signed-in user reads the fields: every record form, record page and list filter
// needs them.
customFieldsRouter.get("/", listCustomFieldsHandler);

// Changing them is for Admins (CF-01).
customFieldsRouter.use(requireRole("ADMIN"));
customFieldsRouter.post("/", createCustomFieldHandler);
// Above /:id, or "order" would be read as an id.
customFieldsRouter.put("/order", reorderCustomFieldsHandler);
customFieldsRouter.patch("/:id", updateCustomFieldHandler);
customFieldsRouter.delete("/:id", deleteCustomFieldHandler);
customFieldsRouter.post("/:id/archive", archiveCustomFieldHandler);
customFieldsRouter.post("/:id/restore", restoreCustomFieldHandler);

// Documented beside the routes so the two cannot drift apart.
const tags = ["Custom fields"];
const security = sessionSecurity;
const params = recordIdParamsSchema;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const notAdmin = errorResponse("Not an Admin (FORBIDDEN)");
const notFound = errorResponse("No custom field has this id (NOT_FOUND)");

registry.registerPath({
  method: "get",
  path: "/custom-fields",
  tags,
  summary: "List the custom fields, of one record type or of all",
  description:
    "In order: by record type, then the order the Admin gave the fields. Archived fields are left out unless includeArchived=true, which only an Admin may send; they then follow the fields in use of their record type.",
  security,
  request: { query: customFieldListQuerySchema },
  responses: {
    200: jsonResponse("The fields, in order", customFieldListResponseSchema),
    400: errorResponse("VALIDATION_FAILED: a recordType or includeArchived that is not a value"),
    401: unauthenticated,
    403: errorResponse("includeArchived=true from someone who is not an Admin (FORBIDDEN)"),
  },
});

registry.registerPath({
  method: "post",
  path: "/custom-fields",
  tags,
  summary: "Add a custom field to a record type, last in its order (Admin only)",
  description:
    "A DROPDOWN needs 1 to 50 options, each once whatever the case; the other types take none. The label is 1 to 60 characters and unique among the fields of the record type, archived ones included, whatever the case. A record type can have 30 fields in use.",
  security,
  request: { body: jsonBody(createCustomFieldBodySchema) },
  responses: {
    201: jsonResponse("The new field", customFieldResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: bad input, a label another field of the record type has, options that do not fit the type (details name the field), or the record type already has 30 fields in use (details null)",
    ),
    401: unauthenticated,
    403: notAdmin,
  },
});

registry.registerPath({
  method: "put",
  path: "/custom-fields/order",
  tags,
  summary: "Put the fields of one record type in a new order (Admin only)",
  description:
    "ids must hold every field of the record type that is in use (not archived) exactly once. Answers with every field of that record type, archived ones last.",
  security,
  request: { body: jsonBody(reorderCustomFieldsBodySchema) },
  responses: {
    200: jsonResponse("Every field of the record type, in order", customFieldListResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: bad input, or ids that are not every field in use exactly once",
    ),
    401: unauthenticated,
    403: notAdmin,
  },
});

registry.registerPath({
  method: "patch",
  path: "/custom-fields/{id}",
  tags,
  summary: "Change a field's label, options or whether it is required (Admin only)",
  description:
    "Only the keys sent are changed; the record type and the type are fixed. options replaces the whole list. A record that holds an option that was removed keeps showing it and can be saved with it unchanged, but the option can no longer be chosen. Making a field required does not touch existing records: it is checked when a record is created and when a request sends the field.",
  security,
  request: { params, body: jsonBody(updateCustomFieldBodySchema) },
  responses: {
    200: jsonResponse("The field", customFieldResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: bad input, a label another field of the record type has, or options that do not fit the type",
    ),
    401: unauthenticated,
    403: notAdmin,
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/custom-fields/{id}/archive",
  tags,
  summary: "Archive a field: hide it everywhere but keep its values (Admin only)",
  description:
    "An archived field is left out of records, forms, filters, imports and exports, and a request that names it is refused. Archiving an archived field answers with it as it is.",
  security,
  request: { params },
  responses: {
    200: jsonResponse("The field, archived", customFieldResponseSchema),
    400: errorResponse("VALIDATION_FAILED: the id is not a UUID"),
    401: unauthenticated,
    403: notAdmin,
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/custom-fields/{id}/restore",
  tags,
  summary: "Bring an archived field back, last in its order, with its values (Admin only)",
  security,
  request: { params },
  responses: {
    200: jsonResponse("The field, in use again", customFieldResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: the id is not a UUID, or the record type already has 30 fields in use (details null)",
    ),
    401: unauthenticated,
    403: notAdmin,
    404: notFound,
  },
});

registry.registerPath({
  method: "delete",
  path: "/custom-fields/{id}",
  tags,
  summary: "Delete an archived field for good, with every value records hold for it",
  description: "Admin only. A field that is in use must be archived first.",
  security,
  request: { params },
  responses: {
    200: jsonResponse("Deleted; data is null", deletedResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: the id is not a UUID, or the field is not archived (details null)",
    ),
    401: unauthenticated,
    403: notAdmin,
    404: notFound,
  },
});
