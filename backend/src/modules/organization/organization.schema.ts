import { envelope, z } from "../../lib/openapi";
import { optionalEmailSchema, optionalText } from "../../lib/record-fields";
import { percentSchema } from "../../lib/sales-documents";

// Who the quotes and invoices are from, and what a new quote starts with.
export const organizationSchema = z
  .object({
    // "" until an Admin fills it in.
    name: z.string(),
    address: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    taxId: z.string().nullable(),
    // The terms a new quote starts with.
    defaultQuoteTerms: z.string().nullable(),
    // A new quote is valid for this many days from its issue date.
    defaultValidityDays: z.number().int(),
    // Percent, for a quote line whose product names no tax rate.
    defaultTaxRate: z.number(),
    // A new invoice is due this many days after its issue date.
    invoicePaymentTermsDays: z.number().int(),
    // null while nothing was saved yet.
    updatedAt: z.string().nullable(),
  })
  .openapi("OrganizationSettings");

export type ApiOrganization = z.infer<typeof organizationSchema>;

// PUT replaces the settings: a text that is left out is cleared, a number that is left out
// goes back to its default.
export const updateOrganizationBodySchema = z
  .strictObject({
    name: z.string().trim().max(200),
    address: optionalText(1000),
    email: optionalEmailSchema,
    phone: optionalText(50),
    taxId: optionalText(100),
    defaultQuoteTerms: optionalText(5000),
    defaultValidityDays: z.number().int().min(1).max(365).default(30),
    defaultTaxRate: percentSchema.default(0),
    invoicePaymentTermsDays: z.number().int().min(0).max(365).default(30),
  })
  .openapi("UpdateOrganizationBody");

export type UpdateOrganizationBody = z.infer<typeof updateOrganizationBodySchema>;

export const organizationResponseSchema = envelope(organizationSchema);
