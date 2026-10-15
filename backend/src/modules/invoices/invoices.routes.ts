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
import { recordIdParamsSchema } from "../../lib/record-fields";
import { authenticate } from "../../middleware/authenticate";
import { salesDocumentResponseSchema } from "../quotes/quotes.schema";
import {
  exportInvoicesHandler,
  getInvoiceDocumentHandler,
  getInvoiceHandler,
  getInvoicePdfHandler,
  getInvoiceSummaryHandler,
  listInvoicesHandler,
  markInvoiceOverdueHandler,
  markInvoicePaidHandler,
  markInvoiceSentHandler,
  markInvoiceUnpaidHandler,
  restoreInvoiceHandler,
  updateInvoiceHandler,
  voidInvoiceHandler,
} from "./invoices.controller";
import {
  invoiceListQuerySchema,
  invoiceListResponseSchema,
  invoiceResponseSchema,
  invoiceSummaryResponseSchema,
  invoiceViewQuerySchema,
  markPaidBodySchema,
  updateInvoiceBodySchema,
} from "./invoices.schema";

export const invoicesRouter = Router();

// Any signed-in user. Which invoices each role may see and change is decided in the
// service: it follows the invoice's opportunity (lib/record-access.ts). An invoice is made
// with POST /quotes/:id/invoice.
invoicesRouter.use(authenticate);

invoicesRouter.get("/", listInvoicesHandler);
// Above /:id, or "summary" and "export" would be read as ids.
invoicesRouter.get("/summary", getInvoiceSummaryHandler);
invoicesRouter.get("/export", exportInvoicesHandler);
invoicesRouter.get("/:id", getInvoiceHandler);
invoicesRouter.patch("/:id", updateInvoiceHandler);
invoicesRouter.get("/:id/document", getInvoiceDocumentHandler);
invoicesRouter.get("/:id/pdf", getInvoicePdfHandler);
invoicesRouter.post("/:id/mark-sent", markInvoiceSentHandler);
invoicesRouter.post("/:id/mark-paid", markInvoicePaidHandler);
invoicesRouter.post("/:id/mark-overdue", markInvoiceOverdueHandler);
invoicesRouter.post("/:id/mark-unpaid", markInvoiceUnpaidHandler);
invoicesRouter.post("/:id/void", voidInvoiceHandler);
invoicesRouter.post("/:id/restore", restoreInvoiceHandler);

// Documented beside the routes so the two cannot drift apart.
const tags = ["Invoices"];
const security = sessionSecurity;
const params = recordIdParamsSchema;
const query = invoiceViewQuerySchema;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const readOnly = errorResponse("A Read-only user cannot change invoices (FORBIDDEN)");
const validationFailed = errorResponse("The request is not acceptable (VALIDATION_FAILED)");
const notFound = errorResponse(
  "No invoice has this id, or its opportunity is not one the caller may see (NOT_FOUND)",
);
const TZ =
  "tz is the viewer's time zone (UTC when left out): it decides whether a sent invoice past its dueDate reads as OVERDUE.";

registry.registerPath({
  method: "get",
  path: "/invoices",
  tags,
  summary: "List the invoices the caller may see, with search, filters, sorting and paging",
  description: `The invoices of the opportunities the caller may see. search matches the invoice's number and the company's name as the invoice has it. The newest number first unless asked otherwise. status follows what an invoice reads as: OVERDUE lists the ones marked overdue and the sent ones past their due date, SENT only the sent ones that are not. ${TZ}`,
  security,
  request: { query: invoiceListQuerySchema },
  responses: {
    200: jsonResponse(
      "One page of invoices; meta.total counts every match",
      invoiceListResponseSchema,
    ),
    400: validationFailed,
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "get",
  path: "/invoices/summary",
  tags,
  summary: "Totals and counts over the invoices the caller may see",
  description: `outstandingTotal adds up the sent and overdue invoices, overdueTotal those that read as OVERDUE, paidThisMonthTotal those paid in the viewer's current month. counts follows what each invoice reads as. ${TZ}`,
  security,
  request: { query },
  responses: {
    200: jsonResponse("The figures", invoiceSummaryResponseSchema),
    400: validationFailed,
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "get",
  path: "/invoices/export",
  tags,
  summary: "Download the invoices the caller may see as a CSV file",
  description:
    "The list itself as a file: the same search, filters, sort and visibility, without paging. One row per invoice (no lines). Written like every other export: UTF-8 with a byte order mark, at most 10,000 rows, formulas neutralised.",
  security,
  request: { query: invoiceListQuerySchema },
  responses: {
    200: csvResponse("The CSV file"),
    400: validationFailed,
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "get",
  path: "/invoices/{id}",
  tags,
  summary: "Get one invoice with its lines",
  description: TZ,
  security,
  request: { params, query },
  responses: {
    200: jsonResponse("The invoice", invoiceResponseSchema),
    401: unauthenticated,
    404: notFound,
  },
});

registry.registerPath({
  method: "get",
  path: "/invoices/{id}/document",
  tags,
  summary: "The invoice as a print-ready document",
  description: `Like GET /quotes/{id}/document: the seller from the organisation settings, the buyer as the invoice has it, the lines, the totals with one row per tax rate, the notes and the terms. ${TZ}`,
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
  path: "/invoices/{id}/pdf",
  tags,
  summary: "Download the invoice as a PDF file",
  description: `Like GET /quotes/{id}/pdf: the print-ready document (GET /invoices/{id}/document) as an A4 PDF file named after the invoice, such as INV-0001.pdf. A draft or sent invoice carries no status; paid, overdue and void are printed. Characters outside WinAnsi (Latin-1) are written as "?". Works from a plain link with the session cookie and with a Bearer token. Errors are the usual JSON. ${TZ}`,
  security,
  request: { params, query },
  responses: {
    200: pdfResponse("The PDF file", "INV-0001.pdf"),
    400: validationFailed,
    401: unauthenticated,
    404: notFound,
  },
});

registry.registerPath({
  method: "patch",
  path: "/invoices/{id}",
  tags,
  summary: "Change an invoice's due date or notes",
  description: `Nothing else about an invoice can be changed: its buyer, lines and totals are a copy of the quote. A void invoice cannot be changed at all. ${TZ}`,
  security,
  request: { params, query, body: jsonBody(updateInvoiceBodySchema) },
  responses: {
    200: jsonResponse("The changed invoice", invoiceResponseSchema),
    400: errorResponse("VALIDATION_FAILED: bad input, or a dueDate before the issue date"),
    401: unauthenticated,
    403: readOnly,
    404: notFound,
    409: errorResponse("INVALID_STATUS_CHANGE: the invoice is void"),
  },
});

// The six changes of status are documented from one table, like their handlers.
const CHANGES = [
  {
    action: "mark-sent",
    summary: "Mark a draft invoice as sent",
    description: "DRAFT to SENT; sets sentAt. Nothing is emailed.",
  },
  {
    action: "mark-overdue",
    summary: "Mark a sent invoice as overdue",
    description:
      "SENT to OVERDUE. A sent invoice past its due date already reads as OVERDUE without this; marking it keeps it overdue whatever the due date.",
  },
  {
    action: "mark-unpaid",
    summary: "Put a paid or overdue invoice back to sent",
    description: "PAID or OVERDUE to SENT; clears paidAt. The way back from a wrong click.",
  },
  {
    action: "void",
    summary: "Void an invoice",
    description:
      "DRAFT, SENT or OVERDUE to VOID. A paid invoice must be marked unpaid first. The invoice keeps its number, and its quote still cannot have another invoice.",
  },
  {
    action: "restore",
    summary: "Put a void invoice back to draft",
    description: "VOID to DRAFT; clears sentAt. The way back from a wrong click.",
  },
] as const;

const wrongStatus = errorResponse(
  "INVALID_STATUS_CHANGE: the invoice is not in a status this change starts from (details.status is the status it is stored as)",
);

for (const change of CHANGES) {
  registry.registerPath({
    method: "post",
    path: `/invoices/{id}/${change.action}`,
    tags,
    summary: change.summary,
    description: `${change.description} Writes an INVOICE_STATUS entry on the opportunity's timeline. ${TZ}`,
    security,
    request: { params, query },
    responses: {
      200: jsonResponse("The invoice in its new status", invoiceResponseSchema),
      401: unauthenticated,
      403: readOnly,
      404: notFound,
      409: wrongStatus,
    },
  });
}

registry.registerPath({
  method: "post",
  path: "/invoices/{id}/mark-paid",
  tags,
  summary: "Mark an invoice as paid",
  description: `DRAFT, SENT or OVERDUE to PAID. paidAt is when the money came in; left out (the body may be left out altogether) it is now. Writes an INVOICE_STATUS entry on the opportunity's timeline. ${TZ}`,
  security,
  request: {
    params,
    query,
    body: { required: false, content: { "application/json": { schema: markPaidBodySchema } } },
  },
  responses: {
    200: jsonResponse("The invoice, now PAID", invoiceResponseSchema),
    400: errorResponse("VALIDATION_FAILED: bad input, or a paidAt in the future"),
    401: unauthenticated,
    403: readOnly,
    404: notFound,
    409: wrongStatus,
  },
});
