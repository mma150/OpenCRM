import { Router } from "express";

import {
  csvResponse,
  errorResponse,
  jsonBody,
  jsonResponse,
  registry,
  sessionSecurity,
} from "../../lib/openapi";
import { deletedResponseSchema, recordIdParamsSchema } from "../../lib/record-fields";
import { CSV_EXPORT, CUSTOM_FIELD_FILTERS } from "../../lib/route-docs";
import { authenticate } from "../../middleware/authenticate";
import {
  assignCompanyHandler,
  createCompanyHandler,
  deleteCompanyHandler,
  exportCompaniesHandler,
  getCompanyHandler,
  listCompaniesHandler,
  listIndustriesHandler,
  updateCompanyHandler,
} from "./companies.controller";
import {
  assignCompanyBodySchema,
  companyExportQuerySchema,
  companyListQuerySchema,
  companyListResponseSchema,
  companyResponseSchema,
  createCompanyBodySchema,
  industriesResponseSchema,
  updateCompanyBodySchema,
} from "./companies.schema";

export const companiesRouter = Router();

// Any signed-in user. Which companies each role may see and change is decided in the
// service (lib/record-access.ts), because it depends on who owns the company.
companiesRouter.use(authenticate);

companiesRouter.get("/", listCompaniesHandler);
companiesRouter.post("/", createCompanyHandler);
// Above /:id, or "industries" and "export" would be read as ids.
companiesRouter.get("/industries", listIndustriesHandler);
companiesRouter.get("/export", exportCompaniesHandler);
companiesRouter.get("/:id", getCompanyHandler);
companiesRouter.patch("/:id", updateCompanyHandler);
companiesRouter.delete("/:id", deleteCompanyHandler);
companiesRouter.post("/:id/assign", assignCompanyHandler);

// Documented beside the routes so the two cannot drift apart.
const tags = ["Companies"];
const security = sessionSecurity;
const params = recordIdParamsSchema;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const readOnly = errorResponse("A Read-only user cannot change records (FORBIDDEN)");
const validationFailed = errorResponse("The request is not acceptable (VALIDATION_FAILED)");
const badOwner = errorResponse(
  "VALIDATION_FAILED: bad input, or an ownerId the caller may not assign companies to",
);
const notFound = errorResponse(
  "No company has this id, or it is not one the caller may see (NOT_FOUND)",
);

registry.registerPath({
  method: "get",
  path: "/companies",
  tags,
  summary: "List the companies the caller may see, with search, filters, sorting and paging",
  description: `search matches the name, website and industry. industry matches the whole value, whatever the case. Sorted by name, A to Z, unless asked otherwise; a company without an industry sorts last. ${CUSTOM_FIELD_FILTERS}`,
  security,
  request: { query: companyListQuerySchema },
  responses: {
    200: jsonResponse(
      "One page of companies; meta.total counts every match",
      companyListResponseSchema,
    ),
    400: validationFailed,
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "get",
  path: "/companies/industries",
  tags,
  summary: "The industries in use among the companies the caller may see, for a filter",
  security,
  responses: {
    200: jsonResponse("The industries, A to Z", industriesResponseSchema),
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "get",
  path: "/companies/export",
  tags,
  summary: "Download the companies the caller may see as a CSV file",
  description: CSV_EXPORT,
  security,
  request: { query: companyExportQuerySchema },
  responses: {
    200: csvResponse("The CSV file"),
    400: validationFailed,
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "post",
  path: "/companies",
  tags,
  summary: "Create a company, owned by the caller unless ownerId says otherwise",
  security,
  request: { body: jsonBody(createCompanyBodySchema) },
  responses: {
    201: jsonResponse("The new company", companyResponseSchema),
    400: badOwner,
    401: unauthenticated,
    403: readOnly,
  },
});

registry.registerPath({
  method: "get",
  path: "/companies/{id}",
  tags,
  summary: "Read one company",
  description: "contactCount counts the contacts linked to it that the caller may see.",
  security,
  request: { params },
  responses: {
    200: jsonResponse("The company", companyResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    404: notFound,
  },
});

registry.registerPath({
  method: "patch",
  path: "/companies/{id}",
  tags,
  summary: "Change a company's details",
  description: "Only the keys sent are changed; null clears a field that can be empty.",
  security,
  request: { params, body: jsonBody(updateCompanyBodySchema) },
  responses: {
    200: jsonResponse("The updated company", companyResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    403: readOnly,
    404: notFound,
  },
});

registry.registerPath({
  method: "delete",
  path: "/companies/{id}",
  tags,
  summary: "Delete a company (it is kept in the database but never shown again)",
  description: "Its contacts are kept; they no longer belong to a company.",
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
  path: "/companies/{id}/assign",
  tags,
  summary: "Give a company to another owner (Admin and Sales Manager only)",
  description: "Its contacts keep their own owners.",
  security,
  request: { params, body: jsonBody(assignCompanyBodySchema) },
  responses: {
    200: jsonResponse("The company with its new owner", companyResponseSchema),
    400: badOwner,
    401: unauthenticated,
    403: errorResponse("Not an Admin or a Sales Manager (FORBIDDEN)"),
    404: notFound,
  },
});
