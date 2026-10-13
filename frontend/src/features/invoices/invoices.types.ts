import type { components, paths } from "@/lib/api/schema";

type Schemas = components["schemas"];

// An invoice is a copy made from an accepted quote: its buyer, lines, totals and terms never
// change afterwards. Only the due date and the notes can be edited. Access follows the
// opportunity, as for quotes.
export type Invoice = Schemas["Invoice"];
// DRAFT, SENT, PAID, OVERDUE or VOID, as the invoice READS for the viewer: a SENT invoice
// whose due date is before the viewer's today reads as OVERDUE, like one a user marked.
export type InvoiceStatus = Schemas["InvoiceStatus"];
export type InvoiceLine = Schemas["DocumentLine"];
export type UpdateInvoiceInput = Schemas["UpdateInvoiceBody"];
// The outstanding, overdue and paid-this-month totals, and how many invoices read as each
// status, over the invoices the viewer may see.
export type InvoiceSummary = Schemas["InvoiceSummary"];

// The status changes: POST /invoices/:id/<action>.
export type InvoiceAction =
  "mark-sent" | "mark-paid" | "mark-overdue" | "mark-unpaid" | "void" | "restore";

// Search, filters, sort and page of GET /invoices. `tz` is added by invoices.api.ts.
export type InvoiceListQuery = Omit<
  NonNullable<paths["/invoices"]["get"]["parameters"]["query"]>,
  "tz"
>;
export type InvoiceSort = NonNullable<InvoiceListQuery["sort"]>;

// Response bodies: { data, meta }.
export type InvoicesResponse =
  paths["/invoices"]["get"]["responses"]["200"]["content"]["application/json"];
export type InvoiceResponse =
  paths["/invoices/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type InvoiceSummaryResponse =
  paths["/invoices/summary"]["get"]["responses"]["200"]["content"]["application/json"];
export type InvoiceDocumentResponse =
  paths["/invoices/{id}/document"]["get"]["responses"]["200"]["content"]["application/json"];

// What the slice keeps for the list: one page of invoices plus `meta` (page, pageSize, total).
export type InvoiceList = { invoices: Invoice[] } & Schemas["ListMeta"];
