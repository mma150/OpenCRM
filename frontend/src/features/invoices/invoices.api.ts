import { type DownloadedFile, downloadExport } from "@/lib/api/download";
import { http } from "@/lib/api/http";
import type { SalesDocument } from "@/lib/sales-document";
import { browserTimeZone } from "@/lib/time-zone";

import type {
  Invoice,
  InvoiceAction,
  InvoiceDocumentResponse,
  InvoiceList,
  InvoiceListQuery,
  InvoiceResponse,
  InvoicesResponse,
  InvoiceSummary,
  InvoiceSummaryResponse,
  UpdateInvoiceInput,
} from "./invoices.types";

// Every invoice route takes the viewer's time zone, because `status` in the answer depends
// on the viewer's day (a sent invoice reads as OVERDUE after its due date). It is added
// here, so a caller never passes it and cannot forget it.
function withTz() {
  return { params: { tz: browserTimeZone() } };
}

// One page of the invoices the signed-in user may see. `meta.total` counts every match.
export async function listInvoices(query: InvoiceListQuery): Promise<InvoiceList> {
  const response = await http.get<InvoicesResponse>("/invoices", {
    params: { ...query, tz: browserTimeZone() },
  });
  return { invoices: response.data.data, ...response.data.meta };
}

// The list as a CSV file. `downloadExport` adds the time zone.
export function exportInvoices(query: InvoiceListQuery): Promise<DownloadedFile> {
  return downloadExport("/invoices/export", query, "invoices.csv");
}

// Outstanding, overdue and paid this month, over the invoices the viewer may see.
export async function getInvoiceSummary(): Promise<InvoiceSummary> {
  const response = await http.get<InvoiceSummaryResponse>("/invoices/summary", withTz());
  return response.data.data;
}

export async function getInvoice(id: string): Promise<Invoice> {
  const response = await http.get<InvoiceResponse>(`/invoices/${id}`, withTz());
  return response.data.data;
}

// The print-ready document: seller, buyer, lines, the tax table and totals.
export async function getInvoiceDocument(id: string): Promise<SalesDocument> {
  const response = await http.get<InvoiceDocumentResponse>(`/invoices/${id}/document`, withTz());
  return response.data.data;
}

// Only the due date and the notes, and nothing on a VOID invoice.
export async function updateInvoice(id: string, input: UpdateInvoiceInput): Promise<Invoice> {
  const response = await http.patch<InvoiceResponse>(`/invoices/${id}`, input, withTz());
  return response.data.data;
}

// A status change. The API goes by the status that is STORED and answers
// INVALID_STATUS_CHANGE (with `details.status`) when the action does not start from it.
// `paidAt` is for "mark-paid" only: the moment it was paid, now when left out.
export async function changeInvoiceStatus(
  id: string,
  action: InvoiceAction,
  paidAt?: string,
): Promise<Invoice> {
  const response = await http.post<InvoiceResponse>(
    `/invoices/${id}/${action}`,
    action === "mark-paid" && paidAt ? { paidAt } : undefined,
    withTz(),
  );
  return response.data.data;
}
