import type { SalesDocument } from "@/lib/sales-document";
import { adminUser } from "@/test/render-with-store";

import type { Invoice, InvoiceList, InvoiceListQuery, InvoiceSummary } from "./invoices.types";

// A sent invoice with every field filled in: two lines, a discount, tax, notes and terms.
// It is due on a day far in the future, so it never reads as overdue while the tests run.
export const sent: Invoice = {
  id: "99999999-9999-4999-8999-999999999991",
  number: "INV-0003",
  quote: { id: "88888888-8888-4888-8888-888888888881", number: "Q-0003" },
  opportunity: { id: "ffffffff-ffff-4fff-8fff-fffffffffff1", name: "Fleet Expansion" },
  contact: {
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    name: "Marcus Chen",
    email: "m.chen@northwind.example",
  },
  company: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", name: "Northwind Logistics" },
  status: "SENT",
  issueDate: "2026-10-05",
  dueDate: "2099-11-04",
  lines: [
    {
      id: "line-1",
      productId: "product-1",
      description: "Fleet tracking licence",
      quantity: 120,
      unitPrice: 29,
      discountPercent: 10,
      taxRate: 8.25,
      lineTotal: 3132,
    },
    {
      id: "line-2",
      productId: null,
      description: "On-site installation day",
      quantity: 2.5,
      unitPrice: 850,
      discountPercent: 0,
      taxRate: 0,
      lineTotal: 2125,
    },
  ],
  subtotal: 5257,
  discountTotal: 250,
  taxTotal: 246.1,
  total: 5253.1,
  notes: "Please quote PO 4417.",
  terms: "Payment is due within 30 days.",
  sentAt: "2026-10-06T09:00:00.000Z",
  paidAt: null,
  createdBy: { id: adminUser.id, name: adminUser.name },
  createdAt: "2026-10-05T09:00:00.000Z",
  updatedAt: "2026-10-06T09:00:00.000Z",
};

export const draft: Invoice = {
  ...sent,
  id: "99999999-9999-4999-8999-999999999992",
  number: "INV-0002",
  status: "DRAFT",
  sentAt: null,
  notes: null,
  terms: null,
  discountTotal: 0,
};

export const paid: Invoice = {
  ...sent,
  id: "99999999-9999-4999-8999-999999999993",
  number: "INV-0004",
  status: "PAID",
  paidAt: "2026-10-08T10:30:00.000Z",
};

// Sent, and past its due date: it READS as overdue while it is stored as SENT.
export const overdue: Invoice = {
  ...sent,
  id: "99999999-9999-4999-8999-999999999994",
  number: "INV-0005",
  status: "OVERDUE",
  issueDate: "2026-08-20",
  dueDate: "2026-09-19",
  company: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", name: "Kestrel Robotics" },
};

// Marked overdue by hand before its due date: it is stored as OVERDUE.
export const markedOverdue: Invoice = {
  ...sent,
  id: "99999999-9999-4999-8999-999999999995",
  number: "INV-0007",
  status: "OVERDUE",
};

export const voided: Invoice = {
  ...sent,
  id: "99999999-9999-4999-8999-999999999996",
  number: "INV-0006",
  status: "VOID",
  company: null,
  contact: null,
};

export const allInvoices: Invoice[] = [voided, overdue, paid, sent, draft];

export function invoiceList(
  invoices: Invoice[] = allInvoices,
  meta: Partial<Omit<InvoiceList, "invoices">> = {},
): InvoiceList {
  return { invoices, page: 1, pageSize: 25, total: invoices.length, ...meta };
}

// What the page asks for when the address holds no list state.
export const defaultQuery: InvoiceListQuery = {
  sort: "number",
  order: "desc",
  page: 1,
  pageSize: 25,
};

export const summary: InvoiceSummary = {
  outstandingTotal: 13804.2,
  overdueTotal: 7547.35,
  paidThisMonthTotal: 14491.5,
  counts: { DRAFT: 1, SENT: 2, PAID: 4, OVERDUE: 1, VOID: 1 },
};

export const emptySummary: InvoiceSummary = {
  outstandingTotal: 0,
  overdueTotal: 0,
  paidThisMonthTotal: 0,
  counts: { DRAFT: 0, SENT: 0, PAID: 0, OVERDUE: 0, VOID: 0 },
};

// The print-ready document of the sent invoice: two tax rates, no discount type (an invoice
// keeps only the discount's amount).
export const invoiceDocument: SalesDocument = {
  kind: "INVOICE",
  number: "INV-0003",
  status: "SENT",
  currency: "USD",
  issueDate: "2026-10-05",
  validUntil: null,
  dueDate: "2026-11-04",
  paymentTermsDays: 30,
  quoteNumber: "Q-0003",
  seller: {
    name: "Northwind Fleet Solutions, Inc.",
    address: "4200 Commerce Park Drive\nAustin, TX 78744",
    email: "sales@northwindfleet.example",
    phone: "+1 (512) 555-0148",
    taxId: "EIN 74-1234567",
  },
  buyer: {
    contactName: "Marcus Chen",
    contactEmail: "m.chen@northwind.example",
    companyName: "Northwind Logistics",
    companyAddress: "12 Harbour Road\nRotterdam",
  },
  opportunityName: "Fleet Expansion",
  preparedBy: { name: "Ada Admin", email: "ada@example.com" },
  lines: [
    ...sent.lines,
    {
      id: "line-3",
      productId: null,
      description: "Premium support plan",
      quantity: 1,
      unitPrice: 2400,
      discountPercent: 0,
      taxRate: 20,
      lineTotal: 2400,
    },
  ],
  subtotal: 7657,
  discountType: null,
  discountValue: null,
  discountTotal: 250,
  taxes: [
    { rate: 8.25, taxableAmount: 3029.74, taxAmount: 249.95 },
    { rate: 20, taxableAmount: 2321.64, taxAmount: 464.33 },
  ],
  taxTotal: 714.28,
  total: 8121.28,
  notes: "Please quote PO 4417.",
  terms: "Payment is due within 30 days.",
};

// The same as a quote: a percentage discount, a validity date, and no payment terms.
export const quoteDocument: SalesDocument = {
  ...invoiceDocument,
  kind: "QUOTE",
  number: "Q-0003",
  status: "ACCEPTED",
  validUntil: "2026-11-04",
  dueDate: null,
  paymentTermsDays: null,
  quoteNumber: null,
  discountType: "PERCENT",
  discountValue: 10,
  discountTotal: 765.7,
};
