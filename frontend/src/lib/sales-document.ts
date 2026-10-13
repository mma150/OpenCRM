import type { components } from "@/lib/api/schema";

// What quotes and invoices share. The print-ready document of GET /quotes/:id/document and
// GET /invoices/:id/document: seller, buyer, lines, one tax row per rate and the totals,
// with nothing left to look up or to count.
export type SalesDocument = components["schemas"]["SalesDocument"];
// One line of a quote or an invoice, as the API answers it. `lineTotal` is before tax and
// before the document's discount.
export type DocumentLine = components["schemas"]["DocumentLine"];
