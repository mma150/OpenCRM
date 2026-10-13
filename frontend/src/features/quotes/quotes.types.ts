import type { components, paths } from "@/lib/api/schema";

type Schemas = components["schemas"];

// A quote belongs to one opportunity; who may see and change it follows that opportunity.
// The totals are always the API's: the client sends lines and reads totals.
export type Quote = Schemas["Quote"];
// DRAFT, SENT, ACCEPTED, DECLINED, or EXPIRED: what a SENT quote reads as once `validUntil`
// is before the viewer's today. EXPIRED is not stored.
export type QuoteStatus = Schemas["QuoteStatus"];
export type QuoteDiscountType = Schemas["QuoteDiscountType"];
// One line as the API answers it, and as a request sends it.
export type QuoteLine = Schemas["DocumentLine"];
export type QuoteLineInput = Schemas["QuoteLineInput"];

export type CreateQuoteInput = Schemas["CreateQuoteBody"];
// Only the keys sent change, except `lines`, which replaces the whole list.
export type UpdateQuoteInput = Schemas["UpdateQuoteBody"];
// The email a quote is sent with: POST /quotes/:id/send { email }.
export type QuoteEmail = NonNullable<Schemas["SendQuoteBody"]["email"]>;
export type CreateInvoiceInput = Schemas["CreateInvoiceBody"];

// Search, filters, sort and page of GET /quotes. `tz` is added by quotes.api.ts.
export type QuoteListQuery = Omit<
  NonNullable<paths["/quotes"]["get"]["parameters"]["query"]>,
  "tz"
>;
export type QuoteSort = NonNullable<QuoteListQuery["sort"]>;

// Response bodies: { data, meta }.
export type QuotesResponse =
  paths["/quotes"]["get"]["responses"]["200"]["content"]["application/json"];
export type QuoteResponse =
  paths["/quotes/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type CreateQuoteResponse =
  paths["/quotes"]["post"]["responses"]["201"]["content"]["application/json"];
export type QuoteDocumentResponse =
  paths["/quotes/{id}/document"]["get"]["responses"]["200"]["content"]["application/json"];
export type CreateInvoiceResponse =
  paths["/quotes/{id}/invoice"]["post"]["responses"]["201"]["content"]["application/json"];

// What the slice keeps for the list: one page of quotes plus `meta` (page, pageSize, total).
export type QuoteList = { quotes: Quote[] } & Schemas["ListMeta"];
