import type { Request, Response } from "express";

import { sendCsv } from "../../lib/csv-export";
import type { ListMeta } from "../../lib/list-query";
import { recordIdParamsSchema } from "../../lib/record-fields";
import type { SalesDocument } from "../../lib/sales-documents";
import { dayIn } from "../../lib/time-zone";
import { getAuth } from "../../middleware/authenticate";
import { type ApiInvoice, createInvoiceBodySchema } from "../invoices/invoices.schema";
import { createInvoice } from "../invoices/invoices.service";
import {
  type ApiQuote,
  createQuoteBodySchema,
  quoteListQuerySchema,
  quoteViewQuerySchema,
  sendQuoteBodySchema,
  updateQuoteBodySchema,
} from "./quotes.schema";
import {
  acceptQuote,
  createQuote,
  declineQuote,
  deleteQuote,
  duplicateQuote,
  exportQuotes,
  getQuote,
  getQuoteDocument,
  listQuotes,
  reopenQuote,
  sendQuote,
  updateQuote,
} from "./quotes.service";

// The viewer's calendar day, from the `tz` query parameter every quote route takes: it
// decides whether a sent quote reads as EXPIRED, and what "today" is for a new quote.
function viewerDay(req: Request): string {
  return dayIn(quoteViewQuerySchema.parse(req.query).tz, new Date());
}

export async function listQuotesHandler(req: Request, res: Response) {
  const query = quoteListQuerySchema.parse(req.query);
  const { items, total } = await listQuotes(getAuth(req).user, query, viewerDay(req));
  const meta: ListMeta = { page: query.page, pageSize: query.pageSize, total };
  res.json({ data: items, meta });
}

export async function exportQuotesHandler(req: Request, res: Response) {
  const query = quoteListQuerySchema.parse(req.query);
  const file = await exportQuotes(getAuth(req).user, query, viewerDay(req));
  sendCsv(res, "quotes", query.tz, file);
}

export async function createQuoteHandler(req: Request, res: Response) {
  const input = createQuoteBodySchema.parse(req.body);
  const data: ApiQuote = await createQuote(getAuth(req).user, input, viewerDay(req));
  res.status(201).json({ data, meta: {} });
}

export async function getQuoteHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiQuote = await getQuote(getAuth(req).user, id, viewerDay(req));
  res.json({ data, meta: {} });
}

export async function getQuoteDocumentHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: SalesDocument = await getQuoteDocument(getAuth(req).user, id, viewerDay(req));
  res.json({ data, meta: {} });
}

export async function updateQuoteHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const input = updateQuoteBodySchema.parse(req.body);
  const data: ApiQuote = await updateQuote(getAuth(req).user, id, input, viewerDay(req));
  res.json({ data, meta: {} });
}

export async function deleteQuoteHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  await deleteQuote(getAuth(req).user, id);
  res.json({ data: null, meta: {} });
}

export async function duplicateQuoteHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiQuote = await duplicateQuote(getAuth(req).user, id, viewerDay(req));
  res.status(201).json({ data, meta: {} });
}

export async function sendQuoteHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  // The body is optional: without one the quote is only marked as sent.
  const input = sendQuoteBodySchema.parse(req.body ?? {});
  const data: ApiQuote = await sendQuote(getAuth(req).user, id, input, viewerDay(req));
  res.json({ data, meta: {} });
}

export async function acceptQuoteHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiQuote = await acceptQuote(getAuth(req).user, id, viewerDay(req));
  res.json({ data, meta: {} });
}

export async function declineQuoteHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiQuote = await declineQuote(getAuth(req).user, id, viewerDay(req));
  res.json({ data, meta: {} });
}

export async function reopenQuoteHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiQuote = await reopenQuote(getAuth(req).user, id, viewerDay(req));
  res.json({ data, meta: {} });
}

// QUOT-04. The invoice belongs to the invoices module; the route sits on the quote it is
// made from.
export async function createInvoiceHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  // The body is optional: the dates then follow the organisation's payment terms.
  const input = createInvoiceBodySchema.parse(req.body ?? {});
  const data: ApiInvoice = await createInvoice(getAuth(req).user, id, input, viewerDay(req));
  res.status(201).json({ data, meta: {} });
}
