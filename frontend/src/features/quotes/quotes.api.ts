import { SEND_TIMEOUT_MS } from "@/features/email-settings/email-settings.api";
import type { Invoice } from "@/features/invoices/invoices.types";
import { type DownloadedFile, downloadExport } from "@/lib/api/download";
import { http } from "@/lib/api/http";
import type { SalesDocument } from "@/lib/sales-document";
import { browserTimeZone } from "@/lib/time-zone";

import type {
  CreateInvoiceInput,
  CreateInvoiceResponse,
  CreateQuoteInput,
  CreateQuoteResponse,
  Quote,
  QuoteDocumentResponse,
  QuoteEmail,
  QuoteList,
  QuoteListQuery,
  QuoteResponse,
  QuotesResponse,
  UpdateQuoteInput,
} from "./quotes.types";

// Every quote route takes the viewer's time zone, because `status` in the answer depends on
// the viewer's day (a sent quote reads as EXPIRED after `validUntil`). It is added here, so
// a caller never passes it and cannot forget it.
function withTz() {
  return { params: { tz: browserTimeZone() } };
}

// One page of the quotes the signed-in user may see. `meta.total` counts every match.
export async function listQuotes(query: QuoteListQuery): Promise<QuoteList> {
  const response = await http.get<QuotesResponse>("/quotes", {
    params: { ...query, tz: browserTimeZone() },
  });
  return { quotes: response.data.data, ...response.data.meta };
}

// The list as a CSV file, one row per quote. `downloadExport` adds the time zone.
export function exportQuotes(query: QuoteListQuery): Promise<DownloadedFile> {
  return downloadExport("/quotes/export", query, "quotes.csv");
}

export async function getQuote(id: string): Promise<Quote> {
  const response = await http.get<QuoteResponse>(`/quotes/${id}`, withTz());
  return response.data.data;
}

// The print-ready document: seller, buyer, lines, the tax table and totals, nothing left to
// look up or to count.
export async function getQuoteDocument(id: string): Promise<SalesDocument> {
  const response = await http.get<QuoteDocumentResponse>(`/quotes/${id}/document`, withTz());
  return response.data.data;
}

// What is left out is filled in by the API: the buyer from the opportunity, today as the
// issue date, the organisation's validity days and default terms.
export async function createQuote(input: CreateQuoteInput): Promise<Quote> {
  const response = await http.post<CreateQuoteResponse>("/quotes", input, withTz());
  return response.data.data;
}

// A draft only; otherwise the API answers QUOTE_NOT_EDITABLE.
export async function updateQuote(id: string, input: UpdateQuoteInput): Promise<Quote> {
  const response = await http.patch<QuoteResponse>(`/quotes/${id}`, input, withTz());
  return response.data.data;
}

// A draft only, and for real.
export async function deleteQuote(id: string): Promise<void> {
  await http.delete(`/quotes/${id}`, withTz());
}

// A new draft from a quote in any status: the way to revise one that was sent.
export async function duplicateQuote(id: string): Promise<Quote> {
  const response = await http.post<CreateQuoteResponse>(
    `/quotes/${id}/duplicate`,
    undefined,
    withTz(),
  );
  return response.data.data;
}

// DRAFT to SENT. With `email` the quote is also emailed (the API adds its lines and totals
// below the body as text; there is no attachment), and a quote that is already SENT can be
// emailed again. When sending fails the quote stays as it was.
export async function sendQuote(id: string, email?: QuoteEmail): Promise<Quote> {
  const response = await http.post<QuoteResponse>(`/quotes/${id}/send`, email ? { email } : {}, {
    ...withTz(),
    timeout: SEND_TIMEOUT_MS,
  });
  return response.data.data;
}

// accept: DRAFT or SENT to ACCEPTED (it does not close the opportunity). decline: DRAFT or
// SENT to DECLINED. reopen: SENT, ACCEPTED or DECLINED back to DRAFT, unless an invoice
// exists (INVOICE_EXISTS).
export async function changeQuoteStatus(
  id: string,
  action: "accept" | "decline" | "reopen",
): Promise<Quote> {
  const response = await http.post<QuoteResponse>(`/quotes/${id}/${action}`, undefined, withTz());
  return response.data.data;
}

// The one invoice of an ACCEPTED quote. A second request is INVOICE_EXISTS.
export async function createInvoice(id: string, input: CreateInvoiceInput = {}): Promise<Invoice> {
  const response = await http.post<CreateInvoiceResponse>(`/quotes/${id}/invoice`, input, withTz());
  return response.data.data;
}
