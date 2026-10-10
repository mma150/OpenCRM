import { listEnvelope, listQuerySchema } from "../../lib/list-query";
import { envelope, z } from "../../lib/openapi";
import { daySchema, momentSchema, optionalText, recordLinkSchema } from "../../lib/record-fields";
import { documentContactSchema, documentLineSchema } from "../../lib/sales-documents";
import { timeZoneSchema } from "../../lib/time-zone";

// OVERDUE is stored when a user marks it, and it is also what a SENT invoice reads as once
// its dueDate has passed (on the viewer's calendar, see `tz`).
export const invoiceStatusSchema = z
  .enum(["DRAFT", "SENT", "PAID", "OVERDUE", "VOID"])
  .openapi("InvoiceStatus");

export type ApiInvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const invoiceSchema = z
  .object({
    id: z.string(),
    // "INV-0001": one series per installation, without gaps.
    number: z.string(),
    quote: z.object({ id: z.string(), number: z.string() }),
    opportunity: recordLinkSchema,
    // The buyer as it was when the invoice was made: the names and the email do not follow
    // later changes to the contact or the company. The ids link to the records.
    contact: documentContactSchema.nullable(),
    company: recordLinkSchema.nullable(),
    status: invoiceStatusSchema,
    // Days such as "2026-11-15".
    issueDate: z.string(),
    dueDate: z.string(),
    // Copied from the quote; never changed afterwards.
    lines: z.array(documentLineSchema),
    subtotal: z.number(),
    discountTotal: z.number(),
    taxTotal: z.number(),
    total: z.number(),
    notes: z.string().nullable(),
    // The quote's terms as they were.
    terms: z.string().nullable(),
    sentAt: z.string().nullable(),
    paidAt: z.string().nullable(),
    createdBy: z.object({ id: z.string(), name: z.string() }),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Invoice");

// Named ApiInvoice in code because `Invoice` is the Prisma row.
export type ApiInvoice = z.infer<typeof invoiceSchema>;

// POST /quotes/:id/invoice. The body may be left out.
export const createInvoiceBodySchema = z
  .strictObject({
    // Defaults to the viewer's today.
    issueDate: daySchema.optional(),
    // Defaults to the issue date plus the organisation's payment terms.
    dueDate: daySchema.optional(),
    // Defaults to the quote's notes.
    notes: optionalText(5000),
  })
  .openapi("CreateInvoiceBody");

export type CreateInvoiceBody = z.infer<typeof createInvoiceBodySchema>;

// The only two things about an invoice that can be changed, besides its status.
export const updateInvoiceBodySchema = z
  .strictObject({ dueDate: daySchema.optional(), notes: optionalText(5000) })
  .openapi("UpdateInvoiceBody");

export type UpdateInvoiceBody = z.infer<typeof updateInvoiceBodySchema>;

// The body may be left out: the invoice was then paid now.
export const markPaidBodySchema = z
  .strictObject({
    // When the money came in. Not in the future (a few minutes are allowed for).
    paidAt: momentSchema
      .refine((value) => {
        const time = new Date(value).getTime();
        return Number.isNaN(time) || time <= Date.now() + 5 * 60 * 1000;
      }, "A payment cannot be in the future")
      .optional(),
  })
  .openapi("MarkInvoicePaidBody");

export type MarkPaidBody = z.infer<typeof markPaidBodySchema>;

// Every invoice route takes the viewer's time zone, because whether a sent invoice reads as
// OVERDUE depends on what day it is for them. UTC when left out.
export const invoiceViewQuerySchema = z.object({ tz: timeZoneSchema });

export const invoiceListQuerySchema = listQuerySchema(
  ["number", "issueDate", "dueDate", "total"],
  "number",
).extend({
  status: invoiceStatusSchema.optional(),
  opportunityId: z.uuid().optional(),
  companyId: z.uuid().optional(),
  tz: timeZoneSchema,
});

export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const invoiceSummarySchema = z
  .object({
    // Sent and not paid yet, overdue ones included.
    outstandingTotal: z.number(),
    // Marked overdue, or sent and past the due date.
    overdueTotal: z.number(),
    // Paid with paidAt in the viewer's current month.
    paidThisMonthTotal: z.number(),
    // How many invoices read as each status.
    counts: z.object({
      DRAFT: z.number().int(),
      SENT: z.number().int(),
      PAID: z.number().int(),
      OVERDUE: z.number().int(),
      VOID: z.number().int(),
    }),
  })
  .openapi("InvoiceSummary");

export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;

export const invoiceResponseSchema = envelope(invoiceSchema);
export const invoiceListResponseSchema = listEnvelope(invoiceSchema);
export const invoiceSummaryResponseSchema = envelope(invoiceSummarySchema);
