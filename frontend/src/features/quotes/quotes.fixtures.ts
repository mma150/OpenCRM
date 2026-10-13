import { northwind } from "@/features/companies/companies.fixtures";
import { marcus } from "@/features/contacts/contacts.fixtures";
import { fleet, vision } from "@/features/opportunities/opportunities.fixtures";
import { licence } from "@/features/products/products.fixtures";
import { adminUser } from "@/test/render-with-store";

import type { Quote, QuoteList, QuoteListQuery } from "./quotes.types";

// A draft with every field filled in: a line made from a product, a line typed by hand with
// a discount of its own, a quote discount, notes and terms. The totals are what the API
// would count: 290.00 + 1,912.50, less 10%, with 8.25% tax on the first line's share.
export const draft: Quote = {
  id: "88888888-8888-4888-8888-888888888881",
  number: "Q-0001",
  opportunity: { id: fleet.id, name: fleet.name },
  contact: { id: marcus.id, name: marcus.name, email: "m.chen@northwind.example" },
  company: { id: northwind.id, name: northwind.name },
  status: "DRAFT",
  issueDate: "2026-10-05",
  validUntil: "2099-11-04",
  lines: [
    {
      id: "line-1",
      productId: licence.id,
      description: "Fleet tracking licence",
      quantity: 10,
      unitPrice: 29,
      discountPercent: 0,
      taxRate: 8.25,
      lineTotal: 290,
    },
    {
      id: "line-2",
      productId: null,
      description: "On-site installation day",
      quantity: 2.5,
      unitPrice: 850,
      discountPercent: 10,
      taxRate: 0,
      lineTotal: 1912.5,
    },
  ],
  discountType: "PERCENT",
  discountValue: 10,
  subtotal: 2202.5,
  discountTotal: 220.25,
  taxTotal: 21.53,
  total: 2003.78,
  notes: "Installation in the first week of November.",
  terms: "Payment within 30 days.",
  sentAt: null,
  acceptedAt: null,
  declinedAt: null,
  invoice: null,
  createdBy: { id: adminUser.id, name: adminUser.name },
  createdAt: "2026-10-05T09:00:00.000Z",
  updatedAt: "2026-10-06T09:00:00.000Z",
};

export const sent: Quote = {
  ...draft,
  id: "88888888-8888-4888-8888-888888888882",
  number: "Q-0002",
  status: "SENT",
  sentAt: "2026-10-07T09:00:00.000Z",
};

// A sent quote whose "valid until" day has passed: the API answers EXPIRED for it.
export const expired: Quote = {
  ...sent,
  id: "88888888-8888-4888-8888-888888888883",
  number: "Q-0003",
  status: "EXPIRED",
  validUntil: "2026-10-10",
};

export const accepted: Quote = {
  ...sent,
  id: "88888888-8888-4888-8888-888888888884",
  number: "Q-0004",
  status: "ACCEPTED",
  acceptedAt: "2026-10-08T09:00:00.000Z",
};

export const invoiced: Quote = {
  ...accepted,
  id: "88888888-8888-4888-8888-888888888885",
  number: "Q-0005",
  invoice: { id: "99999999-9999-4999-8999-999999999991", number: "INV-0001" },
};

export const declined: Quote = {
  ...sent,
  id: "88888888-8888-4888-8888-888888888886",
  number: "Q-0006",
  status: "DECLINED",
  declinedAt: "2026-10-08T09:00:00.000Z",
};

// A draft with only what a quote must have: no buyer, no lines, nothing to add up.
export const bare: Quote = {
  ...draft,
  id: "88888888-8888-4888-8888-888888888887",
  number: "Q-0007",
  opportunity: { id: vision.id, name: vision.name },
  contact: null,
  company: null,
  validUntil: null,
  lines: [],
  discountType: "NONE",
  discountValue: 0,
  subtotal: 0,
  discountTotal: 0,
  taxTotal: 0,
  total: 0,
  notes: null,
  terms: null,
};

export const allQuotes: Quote[] = [bare, declined, invoiced, accepted, expired, sent, draft];

// The query the page sends for the plain /quotes address.
export const defaultQuery: QuoteListQuery = {
  sort: "createdAt",
  order: "desc",
  page: 1,
  pageSize: 25,
};

export function quoteList(quotes: Quote[] = allQuotes, meta: Partial<QuoteList> = {}): QuoteList {
  return { quotes, page: 1, pageSize: 25, total: quotes.length, ...meta };
}
