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
  assignContactHandler,
  createContactHandler,
  deleteContactHandler,
  getContactHandler,
  listContactsHandler,
  updateContactHandler,
} from "./contacts.controller";
import {
  assignContactBodySchema,
  contactListQuerySchema,
  contactListResponseSchema,
  contactResponseSchema,
  createContactBodySchema,
  updateContactBodySchema,
} from "./contacts.schema";

export const contactsRouter = Router();

// Any signed-in user. Which contacts each role may see and change is decided in the service
// (lib/record-access.ts), because it depends on who owns the contact.
contactsRouter.use(authenticate);

contactsRouter.get("/", listContactsHandler);
contactsRouter.post("/", createContactHandler);
contactsRouter.get("/:id", getContactHandler);
contactsRouter.patch("/:id", updateContactHandler);
contactsRouter.delete("/:id", deleteContactHandler);
contactsRouter.post("/:id/assign", assignContactHandler);

// Documented beside the routes so the two cannot drift apart.
const tags = ["Contacts"];
const security = sessionSecurity;
const params = recordIdParamsSchema;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const readOnly = errorResponse("A Read-only user cannot change records (FORBIDDEN)");
const validationFailed = errorResponse("The request is not acceptable (VALIDATION_FAILED)");
const badCompany = errorResponse(
  "VALIDATION_FAILED: bad input, or a companyId that is not a company the caller may see",
);
const notFound = errorResponse(
  "No contact has this id, or it is not one the caller may see (NOT_FOUND)",
);

registry.registerPath({
  method: "get",
  path: "/contacts",
  tags,
  summary: "List the contacts the caller may see, with search, filters, sorting and paging",
  description:
    "search matches the first name, last name, email and company name. Sorted by name, A to Z, unless asked otherwise; a contact without a company, or never contacted, sorts last in both directions.",
  security,
  request: { query: contactListQuerySchema },
  responses: {
    200: jsonResponse(
      "One page of contacts; meta.total counts every match",
      contactListResponseSchema,
    ),
    400: validationFailed,
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "post",
  path: "/contacts",
  tags,
  summary: "Create a contact, owned by the caller unless ownerId says otherwise",
  security,
  request: { body: jsonBody(createContactBodySchema) },
  responses: {
    201: jsonResponse("The new contact", contactResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: bad input, an ownerId the caller may not assign contacts to, or a companyId that is not a company the caller may see",
    ),
    401: unauthenticated,
    403: readOnly,
  },
});

registry.registerPath({
  method: "get",
  path: "/contacts/{id}",
  tags,
  summary: "Read one contact",
  description: "company is null when there is none, or it is one the caller may not see.",
  security,
  request: { params },
  responses: {
    200: jsonResponse("The contact", contactResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    404: notFound,
  },
});

registry.registerPath({
  method: "patch",
  path: "/contacts/{id}",
  tags,
  summary: "Change a contact's details or its company",
  description:
    "Only the keys sent are changed; null clears a field that can be empty, and companyId: null takes the contact out of its company.",
  security,
  request: { params, body: jsonBody(updateContactBodySchema) },
  responses: {
    200: jsonResponse("The updated contact", contactResponseSchema),
    400: badCompany,
    401: unauthenticated,
    403: readOnly,
    404: notFound,
  },
});

registry.registerPath({
  method: "delete",
  path: "/contacts/{id}",
  tags,
  summary: "Delete a contact (it is kept in the database but never shown again)",
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
  path: "/contacts/{id}/assign",
  tags,
  summary: "Give a contact to another owner (Admin and Sales Manager only)",
  security,
  request: { params, body: jsonBody(assignContactBodySchema) },
  responses: {
    200: jsonResponse("The contact with its new owner", contactResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: bad input, or an ownerId the caller may not assign contacts to",
    ),
    401: unauthenticated,
    403: errorResponse("Not an Admin or a Sales Manager (FORBIDDEN)"),
    404: notFound,
  },
});
