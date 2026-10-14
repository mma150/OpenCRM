import { Router } from "express";

import {
  errorResponse,
  jsonBody,
  jsonResponse,
  registry,
  sessionSecurity,
} from "../../lib/openapi";
import { recordIdParamsSchema } from "../../lib/record-fields";
import type { RecordType } from "../../lib/timeline";
import { authenticate } from "../../middleware/authenticate";
import { addNoteHandler, listTimelineHandler, logConversationHandler } from "./timeline.controller";
import {
  addNoteBodySchema,
  logConversationBodySchema,
  timelineEntryResponseSchema,
  timelineQuerySchema,
  timelineResponseSchema,
} from "./timeline.schema";

// Mounted at the root of /api/v1, because a timeline hangs off a record: /leads/:id/...,
// /contacts/:id/..., /companies/:id/... and /opportunities/:id/... Each route names
// `authenticate` itself, so the guard covers these paths and nothing else.
//
// There is no PATCH, PUT or DELETE and there must never be one: entries are permanent.
export const timelineRouter = Router();

// Every record type that has a timeline gets the same three routes. A new type is one more
// line here: its path, and what the system writes on its timeline by itself.
const RECORDS: { type: RecordType; path: string; systemEntries: string; lastContact: boolean }[] = [
  {
    type: "lead",
    path: "/leads",
    systemEntries: "is created, changes status or changes owner",
    lastContact: true,
  },
  {
    type: "contact",
    path: "/contacts",
    systemEntries: "is created or changes owner",
    lastContact: true,
  },
  {
    type: "company",
    path: "/companies",
    systemEntries: "is created or changes owner",
    lastContact: false,
  },
  {
    type: "opportunity",
    path: "/opportunities",
    systemEntries: "is created, changes stage, is closed or reopened, or changes owner",
    lastContact: true,
  },
];

// Documented beside the routes so the two cannot drift apart.
const tags = ["Timeline"];
const security = sessionSecurity;
const params = recordIdParamsSchema;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const readOnly = errorResponse("A Read-only user cannot change records (FORBIDDEN)");
const validationFailed = errorResponse("The request is not acceptable (VALIDATION_FAILED)");

for (const { type, path, systemEntries, lastContact } of RECORDS) {
  const aRecord = type === "opportunity" ? "an opportunity" : `a ${type}`;
  timelineRouter.get(`${path}/:id/timeline`, authenticate, listTimelineHandler(type));
  timelineRouter.post(`${path}/:id/conversations`, authenticate, logConversationHandler(type));
  timelineRouter.post(`${path}/:id/notes`, authenticate, addNoteHandler(type));

  const notFound = errorResponse(
    `No ${type} has this id, or it is not one the caller may see (NOT_FOUND)`,
  );

  registry.registerPath({
    method: "get",
    path: `${path}/{id}/timeline`,
    tags,
    summary: `Everything that happened to ${aRecord}, newest first`,
    description:
      `Conversations, notes and the entries the system writes when the ${type} ${systemEntries}. kind narrows it to one kind, or to SYSTEM for all system entries.` +
      (type === "lead"
        ? " fromLead is always null here."
        : ` The entries of every lead that was converted into this ${type} are merged in, in date order, and the kind filter and paging work over both; each such entry has fromLead { id, name } naming the lead (null on the ${type}'s own entries). They stay the lead's entries: nothing is copied, and the lead's own timeline is unchanged. Seeing the ${type} is enough to see them, whoever owns the lead.`),
    security,
    request: { params, query: timelineQuerySchema },
    responses: {
      200: jsonResponse(
        "One page of entries; meta.total counts every match",
        timelineResponseSchema,
      ),
      400: validationFailed,
      401: unauthenticated,
      404: notFound,
    },
  });

  registry.registerPath({
    method: "post",
    path: `${path}/{id}/conversations`,
    tags,
    summary: `Log a conversation with ${aRecord}: when, how, and what was discussed`,
    description:
      "The entry is permanent. occurredAt may be in the past but not more than 5 minutes in the future." +
      (lastContact ? ` The ${type}'s lastContactAt moves forward to it.` : ""),
    security,
    request: { params, body: jsonBody(logConversationBodySchema) },
    responses: {
      201: jsonResponse("The new entry; body is the summary", timelineEntryResponseSchema),
      400: validationFailed,
      401: unauthenticated,
      403: readOnly,
      404: notFound,
    },
  });

  registry.registerPath({
    method: "post",
    path: `${path}/{id}/notes`,
    tags,
    summary: `Add a note to ${aRecord}`,
    description: "The entry is permanent.",
    security,
    request: { params, body: jsonBody(addNoteBodySchema) },
    responses: {
      201: jsonResponse("The new entry", timelineEntryResponseSchema),
      400: validationFailed,
      401: unauthenticated,
      403: readOnly,
      404: notFound,
    },
  });
}
