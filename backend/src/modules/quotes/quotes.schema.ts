import { listEnvelope, listQuerySchema } from "../../lib/list-query";
import { envelope, z } from "../../lib/openapi";
import { daySchema, moneySchema, optionalText, recordLinkSchema } from "../../lib/record-fields";
import {
  DISCOUNT_TYPES,
  documentContactSchema,
  documentLineSchema,
  percentSchema,
  salesDocumentSchema,
} from "../../lib/sales-documents";
import { timeZoneSchema } from "../../lib/time-zone";
import { emailMessageFields } from "../emails/emails.schema";

// EXPIRED is never stored: it is what a SENT quote reads as once its validUntil has passed
// (on the viewer's calendar, see `tz`). An expired quote can still be accepted, declined or
// reopened like any sent one.
export const quoteStatusSchema = z
  .enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"])
  .openapi("QuoteStatus");

export type ApiQuoteStatus = z.infer<typeof quoteStatusSchema>;

export const discountTypeSchema = z.enum(DISCOUNT_TYPES).openapi("QuoteDiscountType");

export const quoteSchema = z
  .object({
    id: z.string(),
    // "Q-0001": one series per installation, in the order the quotes were made.
    number: z.string(),
    opportunity: recordLinkSchema,
    // Who the quote is for. Taken from the opportunity when the quote is made; whoever may
    // see the quote sees them, because they are printed on it.
    contact: documentContactSchema.nullable(),
    company: recordLinkSchema.nullable(),
    status: quoteStatusSchema,
    // Days such as "2026-11-15".
    issueDate: z.string(),
    validUntil: z.string().nullable(),
    lines: z.array(documentLineSchema),
    discountType: discountTypeSchema,
    // A percentage for PERCENT, an amount of money for AMOUNT, 0 for NONE.
    discountValue: z.number(),
    // Counted by the server (lib/sales-documents.ts); a client never adds these up itself.
    subtotal: z.number(),
    discountTotal: z.number(),
    taxTotal: z.number(),
    total: z.number(),
    notes: z.string().nullable(),
    terms: z.string().nullable(),
    sentAt: z.string().nullable(),
    acceptedAt: z.string().nullable(),
    declinedAt: z.string().nullable(),
    // The invoice made from the quote, if any. A quote with one cannot be reopened.
    invoice: z.object({ id: z.string(), number: z.string() }).nullable(),
    createdBy: z.object({ id: z.string(), name: z.string() }),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Quote");

// Named ApiQuote in code because `Quote` is the Prisma row.
export type ApiQuote = z.infer<typeof quoteSchema>;

// The most lines one quote holds.
export const MAX_QUOTE_LINES = 100;

// One line as a request sends it. With a productId, whatever is left out of description,
// unitPrice and taxRate is copied from the product as it is now; without one, description
// and unitPrice are needed. A line never follows its product afterwards.
export const quoteLineInputSchema = z
  .strictObject({
    productId: z.uuid().nullable().optional(),
    description: z.string().trim().min(1).max(500).optional(),
    // More than 0, with at most three decimals.
    quantity: z
      .number()
      .gt(0, "Enter a quantity above 0")
      .max(9_999_999.999)
      .multipleOf(0.001, "Use at most three decimal places"),
    unitPrice: moneySchema.optional(),
    // Percent off this line. Defaults to 0.
    discountPercent: percentSchema.optional(),
    // Percent. Defaults to the product's rate, or else the organisation's default.
    taxRate: percentSchema.optional(),
  })
  .openapi("QuoteLineInput");

export type QuoteLineInput = z.infer<typeof quoteLineInputSchema>;

const quoteFields = {
  // Each must be a record the caller may see. null means none.
  contactId: z.uuid().nullable().optional(),
  companyId: z.uuid().nullable().optional(),
  issueDate: daySchema.optional(),
  validUntil: daySchema.nullable().optional(),
  // The whole list, in order. On PATCH it replaces the lines the quote has.
  lines: z.array(quoteLineInputSchema).max(MAX_QUOTE_LINES).optional(),
  discountType: discountTypeSchema.optional(),
  // A percentage (0 to 100) for PERCENT, an amount of money for AMOUNT.
  discountValue: moneySchema.optional(),
  notes: optionalText(5000),
  terms: optionalText(5000),
};

// What is left out is filled in: the contact and the company from the opportunity, the
// issue date as the viewer's today, validUntil from the organisation's validity days, the
// terms from the organisation's default terms. An explicit null means "none".
export const createQuoteBodySchema = z
  .strictObject({ opportunityId: z.uuid(), ...quoteFields })
  .openapi("CreateQuoteBody");

export type CreateQuoteBody = z.infer<typeof createQuoteBodySchema>;

// Only the keys that are sent are changed. Only a DRAFT quote can be changed.
export const updateQuoteBodySchema = z.strictObject(quoteFields).openapi("UpdateQuoteBody");

export type UpdateQuoteBody = z.infer<typeof updateQuoteBodySchema>;

// The body may be left out: the quote is then only marked as sent.
export const sendQuoteBodySchema = z
  .strictObject({
    // With an email, the quote is also emailed. The server adds the quote's lines and
    // totals below the body.
    email: z.strictObject(emailMessageFields).optional(),
  })
  .openapi("SendQuoteBody");

export type SendQuoteBody = z.infer<typeof sendQuoteBodySchema>;

// Every quote route takes the viewer's time zone, because whether a sent quote reads as
// EXPIRED depends on what day it is for them. UTC when left out.
export const quoteViewQuerySchema = z.object({ tz: timeZoneSchema });

export const quoteListQuerySchema = listQuerySchema(
  ["number", "issueDate", "validUntil", "total", "createdAt"],
  "createdAt",
).extend({
  status: quoteStatusSchema.optional(),
  opportunityId: z.uuid().optional(),
  // The owner of the quote's opportunity.
  ownerId: z.uuid().optional(),
  companyId: z.uuid().optional(),
  tz: timeZoneSchema,
});

export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>;

export const quoteResponseSchema = envelope(quoteSchema);
export const quoteListResponseSchema = listEnvelope(quoteSchema);
export const salesDocumentResponseSchema = envelope(salesDocumentSchema);
