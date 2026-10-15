import { Router } from "express";

import {
  csvResponse,
  errorResponse,
  jsonBody,
  jsonResponse,
  pdfResponse,
  registry,
  sessionSecurity,
} from "../../lib/openapi";
import { deletedResponseSchema, recordIdParamsSchema } from "../../lib/record-fields";
import { authenticate } from "../../middleware/authenticate";
import type { AuthLimiters } from "../../middleware/rate-limit";
import { createInvoiceBodySchema, invoiceResponseSchema } from "../invoices/invoices.schema";
import {
  acceptQuoteHandler,
  createInvoiceHandler,
  createQuoteHandler,
  declineQuoteHandler,
  deleteQuoteHandler,
  duplicateQuoteHandler,
  exportQuotesHandler,
  getQuoteDocumentHandler,
  getQuoteHandler,
  getQuotePdfHandler,
  listQuotesHandler,
  reopenQuoteHandler,
  sendQuoteHandler,
  updateQuoteHandler,
} from "./quotes.controller";
import {
  createQuoteBodySchema,
  quoteListQuerySchema,
  quoteListResponseSchema,
  quoteResponseSchema,
  quoteViewQuerySchema,
  salesDocumentResponseSchema,
  sendQuoteBodySchema,
  updateQuoteBodySchema,
} from "./quotes.schema";

export function createQuotesRouter(limiters: AuthLimiters) {
  const router = Router();

  // Any signed-in user. Which quotes each role may see and change is decided in the
  // service: it follows the quote's opportunity (lib/record-access.ts).
  router.use(authenticate);

  router.get("/", listQuotesHandler);
  router.post("/", createQuoteHandler);
  // Above /:id, or "export" would be read as an id.
  router.get("/export", exportQuotesHandler);
  router.get("/:id", getQuoteHandler);
  router.patch("/:id", updateQuoteHandler);
  router.delete("/:id", deleteQuoteHandler);
  router.get("/:id/document", getQuoteDocumentHandler);
  router.get("/:id/pdf", getQuotePdfHandler);
  router.post("/:id/duplicate", duplicateQuoteHandler);
  // Sending may email the quote, so it counts towards the caller's sending limit.
  router.post("/:id/send", limiters.sendEmail, sendQuoteHandler);
  router.post("/:id/accept", acceptQuoteHandler);
  router.post("/:id/decline", declineQuoteHandler);
  router.post("/:id/reopen", reopenQuoteHandler);
  router.post("/:id/invoice", createInvoiceHandler);

  return router;
}

// Documented beside the routes so the two cannot drift apart.
const tags = ["Quotes"];
const security = sessionSecurity;
const params = recordIdParamsSchema;
const query = quoteViewQuerySchema;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const readOnly = errorResponse("A Read-only user cannot change quotes (FORBIDDEN)");
const validationFailed = errorResponse("The request is not acceptable (VALIDATION_FAILED)");
const notFound = errorResponse(
  "No quote has this id, or its opportunity is not one the caller may see (NOT_FOUND)",
);
const badQuote = errorResponse(
  "VALIDATION_FAILED: bad input; a contactId or companyId that is not a record the caller may see; a line whose product does not exist or is archived, or that has no description or price (details name lines.<index>.<field>); a validUntil before the issue date; a percentage discount above 100",
);
const TZ =
  "tz is the viewer's time zone (UTC when left out): it decides whether a sent quote past its validUntil reads as EXPIRED.";

registry.registerPath({
  method: "get",
  path: "/quotes",
  tags,
  summary: "List the quotes the caller may see, with search, filters, sorting and paging",
  description: `The quotes of the opportunities the caller may see. search matches the quote's number, its opportunity's name and its company's name. Newest first unless asked otherwise; sort=number follows the series. status=SENT leaves out the expired ones and status=EXPIRED lists only those. ownerId is the owner of the opportunity. ${TZ}`,
  security,
  request: { query: quoteListQuerySchema },
  responses: {
    200: jsonResponse("One page of quotes; meta.total counts every match", quoteListResponseSchema),
    400: validationFailed,
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "get",
  path: "/quotes/export",
  tags,
  summary: "Download the quotes the caller may see as a CSV file",
  description:
    "The list itself as a file: the same search, filters, sort and visibility, without paging. One row per quote (no lines). Written like every other export: UTF-8 with a byte order mark, at most 10,000 rows, formulas neutralised.",
  security,
  request: { query: quoteListQuerySchema },
  responses: {
    200: csvResponse("The CSV file"),
    400: validationFailed,
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "post",
  path: "/quotes",
  tags,
  summary: "Create a draft quote on an opportunity",
  description: `Needs an opportunity the caller may see and change. What is left out is filled in: contact and company from the opportunity, issueDate as the viewer's today, validUntil from the organisation's validity days, terms from the organisation's default terms. The number (Q-0001, Q-0002, ...) is given by the server. The totals are counted by the server. Writes a QUOTE_STATUS entry on the opportunity's timeline. ${TZ}`,
  security,
  request: { query, body: jsonBody(createQuoteBodySchema) },
  responses: {
    201: jsonResponse("The new quote", quoteResponseSchema),
    400: errorResponse(
      "VALIDATION_FAILED: as for PATCH, or an opportunityId that is not an opportunity the caller may see",
    ),
    401: unauthenticated,
    403: readOnly,
  },
});

registry.registerPath({
  method: "get",
  path: "/quotes/{id}",
  tags,
  summary: "Get one quote with its lines",
  description: TZ,
  security,
  request: { params, query },
  responses: {
    200: jsonResponse("The quote", quoteResponseSchema),
    401: unauthenticated,
    404: notFound,
  },
});

registry.registerPath({
  method: "get",
  path: "/quotes/{id}/document",
  tags,
  summary: "The quote as a print-ready document",
  description: `Everything a print view or a PDF renderer needs, with nothing left to look up or count: the seller from the organisation settings, the buyer, the lines, the totals with one row per tax rate, the notes and the terms. ${TZ}`,
  security,
  request: { params, query },
  responses: {
    200: jsonResponse("The document", salesDocumentResponseSchema),
    401: unauthenticated,
    404: notFound,
  },
});

registry.registerPath({
  method: "get",
  path: "/quotes/{id}/pdf",
  tags,
  summary: "Download the quote as a PDF file",
  description: `The print-ready document (GET /quotes/{id}/document) as an A4 PDF file named after the quote, such as Q-0001.pdf: the same content in the same order as the web print view, with "Page X of Y" at the foot of every page. A draft or sent quote carries no status; any other status is printed. Written with the PDF standard fonts, which only have the WinAnsi (Latin-1) characters: any other character, such as an emoji or a name in another script, is written as "?". Works from a plain link with the session cookie and with a Bearer token. Errors are the usual JSON. ${TZ}`,
  security,
  request: { params, query },
  responses: {
    200: pdfResponse("The PDF file", "Q-0001.pdf"),
    400: validationFailed,
    401: unauthenticated,
    404: notFound,
  },
});

registry.registerPath({
  method: "patch",
  path: "/quotes/{id}",
  tags,
  summary: "Change a draft quote",
  description: `Only the keys sent are changed, except lines, which replaces the whole list (the lines get new ids). The totals are counted again. Only a DRAFT quote can be changed. ${TZ}`,
  security,
  request: { params, query, body: jsonBody(updateQuoteBodySchema) },
  responses: {
    200: jsonResponse("The changed quote", quoteResponseSchema),
    400: badQuote,
    401: unauthenticated,
    403: readOnly,
    404: notFound,
    409: errorResponse("QUOTE_NOT_EDITABLE: the quote is not a draft; reopen it first"),
  },
});

registry.registerPath({
  method: "delete",
  path: "/quotes/{id}",
  tags,
  summary: "Delete a draft quote",
  description:
    "Only a DRAFT. It is deleted for real, its number is not used again, and the opportunity's timeline gets a QUOTE_STATUS entry with to: null.",
  security,
  request: { params },
  responses: {
    200: jsonResponse("Deleted", deletedResponseSchema),
    401: unauthenticated,
    403: readOnly,
    404: notFound,
    409: errorResponse("QUOTE_NOT_EDITABLE: the quote is not a draft; reopen it first"),
  },
});

registry.registerPath({
  method: "post",
  path: "/quotes/{id}/duplicate",
  tags,
  summary: "Make a new draft from a quote",
  description: `A new quote with its own number and the same opportunity, buyer, lines, discount, notes and terms, issued today and valid for the organisation's validity days. Works on a quote in any status. ${TZ}`,
  security,
  request: { params, query },
  responses: {
    201: jsonResponse("The new draft", quoteResponseSchema),
    401: unauthenticated,
    403: readOnly,
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/quotes/{id}/send",
  tags,
  summary: "Mark a quote as sent, and optionally email it",
  description: `Without a body the quote is only marked SENT. With email, the message is sent first, like POST /emails from the opportunity (the caller's name, Reply-To the caller, placeholders filled in, quote.number and quote.total included), with the quote attached as a PDF file (Q-0001.pdf, as GET /quotes/{id}/pdf draws it once the quote is sent) and a short summary added below the body as text (the file name, the dates and the totals) for mail programs that hide attachments. Then the quote becomes SENT and the opportunity's timeline gets the QUOTE_STATUS entry and an EMAIL entry whose details.quote names the quote and details.attachment is { filename }. When the email fails nothing changes. A quote that is already SENT can be emailed again; without email that is INVALID_STATUS_CHANGE. Needs at least one line. ${TZ}`,
  security,
  request: {
    params,
    query,
    body: { required: false, content: { "application/json": { schema: sendQuoteBodySchema } } },
  },
  responses: {
    200: jsonResponse("The quote, now SENT", quoteResponseSchema),
    400: errorResponse("VALIDATION_FAILED: bad input, or the quote has no lines (details null)"),
    401: unauthenticated,
    403: readOnly,
    404: notFound,
    409: errorResponse(
      "INVALID_STATUS_CHANGE: the quote is accepted or declined, or already sent and no email was asked for (details.status is its status). EMAIL_NOT_CONFIGURED: an email was asked for but no mail server is set up",
    ),
    429: errorResponse("RATE_LIMITED: too many emails in a short time"),
    502: errorResponse("EMAIL_SEND_FAILED: the mail server could not be reached or refused"),
  },
});

registry.registerPath({
  method: "post",
  path: "/quotes/{id}/accept",
  tags,
  summary: "Mark a quote as accepted",
  description: `From DRAFT or SENT (an expired one included). Needs at least one line. Writes a QUOTE_STATUS entry on the opportunity's timeline. The opportunity itself is not closed. An accepted quote can be turned into an invoice. ${TZ}`,
  security,
  request: { params, query },
  responses: {
    200: jsonResponse("The quote, now ACCEPTED", quoteResponseSchema),
    400: errorResponse("VALIDATION_FAILED: the quote has no lines (details null)"),
    401: unauthenticated,
    403: readOnly,
    404: notFound,
    409: errorResponse("INVALID_STATUS_CHANGE: the quote is already accepted or declined"),
  },
});

registry.registerPath({
  method: "post",
  path: "/quotes/{id}/decline",
  tags,
  summary: "Mark a quote as declined",
  description: `From DRAFT or SENT. Writes a QUOTE_STATUS entry on the opportunity's timeline. ${TZ}`,
  security,
  request: { params, query },
  responses: {
    200: jsonResponse("The quote, now DECLINED", quoteResponseSchema),
    401: unauthenticated,
    403: readOnly,
    404: notFound,
    409: errorResponse("INVALID_STATUS_CHANGE: the quote is already accepted or declined"),
  },
});

registry.registerPath({
  method: "post",
  path: "/quotes/{id}/reopen",
  tags,
  summary: "Put a sent, accepted or declined quote back to draft",
  description: `Clears sentAt, acceptedAt and declinedAt, so the quote can be changed again. Refused once an invoice was made from the quote. Writes a QUOTE_STATUS entry on the opportunity's timeline. ${TZ}`,
  security,
  request: { params, query },
  responses: {
    200: jsonResponse("The quote, now DRAFT", quoteResponseSchema),
    401: unauthenticated,
    403: readOnly,
    404: notFound,
    409: errorResponse(
      "INVALID_STATUS_CHANGE: the quote is already a draft. INVOICE_EXISTS: an invoice was made from it (details.invoice is { id, number })",
    ),
  },
});

registry.registerPath({
  method: "post",
  path: "/quotes/{id}/invoice",
  tags: ["Invoices"],
  summary: "Make the invoice of an accepted quote",
  description: `One invoice per quote. The buyer, the lines and the totals are copied as they are now and never change afterwards. The number (INV-0001, INV-0002, ...) is given by the server, without gaps. The body may be left out: issueDate is then the viewer's today and dueDate follows the organisation's payment terms. The invoice starts as DRAFT, and the opportunity's timeline gets an INVOICE_STATUS entry. ${TZ}`,
  security,
  request: {
    params,
    query,
    body: {
      required: false,
      content: { "application/json": { schema: createInvoiceBodySchema } },
    },
  },
  responses: {
    201: jsonResponse("The new invoice", invoiceResponseSchema),
    400: errorResponse("VALIDATION_FAILED: bad input, or a dueDate before the issue date"),
    401: unauthenticated,
    403: readOnly,
    404: notFound,
    409: errorResponse(
      "INVALID_STATUS_CHANGE: the quote is not accepted (details.status is its status). INVOICE_EXISTS: the quote already has an invoice (details.invoice is { id, number })",
    ),
  },
});
