import type { Request, Response } from "express";

import { sendCsv } from "../../lib/csv-export";
import type { ListMeta } from "../../lib/list-query";
import { recordIdParamsSchema } from "../../lib/record-fields";
import type { SalesDocument } from "../../lib/sales-documents";
import { dayIn } from "../../lib/time-zone";
import { getAuth } from "../../middleware/authenticate";
import {
  type ApiInvoice,
  invoiceListQuerySchema,
  type InvoiceSummary,
  invoiceViewQuerySchema,
  markPaidBodySchema,
  updateInvoiceBodySchema,
} from "./invoices.schema";
import {
  changeInvoiceStatus,
  exportInvoices,
  getInvoice,
  getInvoiceDocument,
  getInvoiceSummary,
  type InvoiceChange,
  listInvoices,
  updateInvoice,
} from "./invoices.service";

// The viewer's calendar day, from the `tz` query parameter every invoice route takes: it
// decides whether a sent invoice reads as OVERDUE.
function viewerDay(req: Request): string {
  return dayIn(invoiceViewQuerySchema.parse(req.query).tz, new Date());
}

export async function listInvoicesHandler(req: Request, res: Response) {
  const query = invoiceListQuerySchema.parse(req.query);
  const { items, total } = await listInvoices(getAuth(req).user, query, viewerDay(req));
  const meta: ListMeta = { page: query.page, pageSize: query.pageSize, total };
  res.json({ data: items, meta });
}

export async function exportInvoicesHandler(req: Request, res: Response) {
  const query = invoiceListQuerySchema.parse(req.query);
  const file = await exportInvoices(getAuth(req).user, query, viewerDay(req));
  sendCsv(res, "invoices", query.tz, file);
}

export async function getInvoiceSummaryHandler(req: Request, res: Response) {
  const { tz } = invoiceViewQuerySchema.parse(req.query);
  const data: InvoiceSummary = await getInvoiceSummary(getAuth(req).user, tz, viewerDay(req));
  res.json({ data, meta: {} });
}

export async function getInvoiceHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: ApiInvoice = await getInvoice(getAuth(req).user, id, viewerDay(req));
  res.json({ data, meta: {} });
}

export async function getInvoiceDocumentHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const data: SalesDocument = await getInvoiceDocument(getAuth(req).user, id, viewerDay(req));
  res.json({ data, meta: {} });
}

export async function updateInvoiceHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  const input = updateInvoiceBodySchema.parse(req.body);
  const data: ApiInvoice = await updateInvoice(getAuth(req).user, id, input, viewerDay(req));
  res.json({ data, meta: {} });
}

// One handler per change of status; they differ only in which change they ask for.
function statusHandler(change: InvoiceChange) {
  return async (req: Request, res: Response) => {
    const { id } = recordIdParamsSchema.parse(req.params);
    const user = getAuth(req).user;
    const data: ApiInvoice = await changeInvoiceStatus(user, id, change, {}, viewerDay(req));
    res.json({ data, meta: {} });
  };
}

export const markInvoiceSentHandler = statusHandler("mark-sent");
export const markInvoiceOverdueHandler = statusHandler("mark-overdue");
export const markInvoiceUnpaidHandler = statusHandler("mark-unpaid");
export const voidInvoiceHandler = statusHandler("void");
export const restoreInvoiceHandler = statusHandler("restore");

export async function markInvoicePaidHandler(req: Request, res: Response) {
  const { id } = recordIdParamsSchema.parse(req.params);
  // The body is optional: without one the invoice was paid now.
  const input = markPaidBodySchema.parse(req.body ?? {});
  const user = getAuth(req).user;
  const data: ApiInvoice = await changeInvoiceStatus(user, id, "mark-paid", input, viewerDay(req));
  res.json({ data, meta: {} });
}
