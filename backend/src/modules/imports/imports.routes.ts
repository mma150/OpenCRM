import express, { Router } from "express";

import {
  errorResponse,
  jsonBody,
  jsonResponse,
  registry,
  sessionSecurity,
} from "../../lib/openapi";
import { authenticate } from "../../middleware/authenticate";
import { requireRole } from "../../middleware/require-role";
import {
  listImportFieldsHandler,
  previewImportHandler,
  runImportHandler,
} from "./imports.controller";
import {
  IMPORT_BODY_LIMIT,
  importBodySchema,
  importFieldsQuerySchema,
  importFieldsResponseSchema,
  importPreviewBodySchema,
  importPreviewResponseSchema,
  importResultResponseSchema,
} from "./imports.schema";

export const importsRouter = Router();

// Importing creates records, so it is for the roles that may create them: everyone but a
// Read-only user.
importsRouter.use(authenticate, requireRole("ADMIN", "SALES_MANAGER", "SALES_REP"));
// The file travels as text in the JSON body. app.ts leaves the body of these routes
// unread, so this larger limit applies only here and only after the two checks above.
importsRouter.use(express.json({ limit: IMPORT_BODY_LIMIT }));

importsRouter.get("/fields", listImportFieldsHandler);
importsRouter.post("/preview", previewImportHandler);
importsRouter.post("/", runImportHandler);

// Documented beside the routes so the two cannot drift apart.
const tags = ["Imports"];
const security = sessionSecurity;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const readOnly = errorResponse("A Read-only user cannot import (FORBIDDEN)");
const tooLarge = errorResponse(
  "The file is over 5 MB, or the request body over 12 MB (PAYLOAD_TOO_LARGE)",
);
const FILE_RULES =
  "The file is CSV text with commas between cells and the column names in its first row (UTF-8; a byte order mark is fine). It may hold at most 5 MB and 5,000 data rows; empty rows are ignored. An empty file, a first row without names, a column without a name, two columns with one name (whatever the case), a quoted cell that is never closed and more than 5,000 rows are VALIDATION_FAILED on csv.";

registry.registerPath({
  method: "get",
  path: "/imports/fields",
  tags,
  summary: "The fields a column of a CSV file can be mapped to, for one record type",
  description:
    "The record's own fields, then its custom fields in use (key cf:<custom field id>). For contacts, companyName links the contact to a company by name.",
  security,
  request: { query: importFieldsQuerySchema },
  responses: {
    200: jsonResponse(
      "The fields, in the order a form would show them",
      importFieldsResponseSchema,
    ),
    400: errorResponse("VALIDATION_FAILED: type is missing or not LEAD, CONTACT or COMPANY"),
    401: unauthenticated,
    403: readOnly,
  },
});

registry.registerPath({
  method: "post",
  path: "/imports/preview",
  tags,
  summary: "Read a CSV file's columns and first rows, and suggest a mapping",
  description: `Nothing is saved. ${FILE_RULES} suggestedMapping goes by the column names: a field's own label and common other names for it ("E-mail", "Phone number", "Surname"), whatever the case and punctuation; each field is suggested for one column at most.`,
  security,
  request: { body: jsonBody(importPreviewBodySchema) },
  responses: {
    200: jsonResponse("The columns, a sample and a suggested mapping", importPreviewResponseSchema),
    400: errorResponse("VALIDATION_FAILED: bad input, or a file that cannot be read (see above)"),
    401: unauthenticated,
    403: readOnly,
    413: tooLarge,
  },
});

registry.registerPath({
  method: "post",
  path: "/imports",
  tags,
  summary: "Import leads, contacts or companies from a CSV file with a column mapping",
  description: `${FILE_RULES} mapping names, for each column to import, the key of a field from GET /imports/fields; every required field must be mapped, and no field twice. Each row is checked with the rules of the record's create route and saved on its own: the rows that pass are created, each with its CREATED timeline entry (details.import is true), and the rest come back in errors and failedCsv with the reason. A lead without a Source is given OTHER. Numbers are written like 1200.50 or 1,200.50 and dates like 2026-11-15. Records belong to the caller, or to ownerId.`,
  security,
  request: { body: jsonBody(importBodySchema) },
  responses: {
    200: jsonResponse("What was created, skipped and refused", importResultResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: bad input, a file that cannot be read (csv), a mapping that names an unknown column or field, maps a field twice or leaves a required field out (mapping, mapping.<header>), or an ownerId the caller may not assign records to",
    ),
    401: unauthenticated,
    403: readOnly,
    413: tooLarge,
  },
});
