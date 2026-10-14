import { listEnvelope, listQuerySchema } from "../../lib/list-query";
import { envelope, z } from "../../lib/openapi";
import { moneySchema, optionalText } from "../../lib/record-fields";
import { percentSchema } from "../../lib/sales-documents";
import { timeZoneSchema } from "../../lib/time-zone";

export const productSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    sku: z.string().nullable(),
    description: z.string().nullable(),
    // Money as a number with at most two decimals. The app counts in one currency (USD).
    unitPrice: z.number(),
    // Percent, 0 to 100. null means the organisation's default tax rate applies.
    taxRate: z.number().nullable(),
    // false once archived: still on the quotes that use it, no longer offered for new lines.
    active: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Product");

export type ApiProduct = z.infer<typeof productSchema>;

const nameSchema = z.string().trim().min(1, "Enter a name").max(200);

const productFields = {
  sku: optionalText(60),
  description: optionalText(2000),
  taxRate: percentSchema.nullable().optional(),
};

export const createProductBodySchema = z
  .strictObject({ name: nameSchema, unitPrice: moneySchema, ...productFields })
  .openapi("CreateProductBody");

export type CreateProductBody = z.infer<typeof createProductBodySchema>;

// Only the keys that are sent are changed; null clears the SKU, the description or the tax
// rate. Quotes that already use the product keep the price they were made with.
export const updateProductBodySchema = z
  .strictObject({
    name: nameSchema.optional(),
    unitPrice: moneySchema.optional(),
    ...productFields,
  })
  .openapi("UpdateProductBody");

export type UpdateProductBody = z.infer<typeof updateProductBodySchema>;

export const productListQuerySchema = listQuerySchema(
  ["name", "sku", "unitPrice", "createdAt"],
  "name",
  "asc",
).extend({
  // true: only products in use. false: only archived ones. Left out: both.
  active: z.enum(["true", "false"]).optional(),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;

// The export takes what the list takes (paging is ignored), and the viewer's time zone for
// the times in the file and its name.
export const productExportQuerySchema = productListQuerySchema.extend({ tz: timeZoneSchema });

export type ProductExportQuery = z.infer<typeof productExportQuerySchema>;

export const productResponseSchema = envelope(productSchema);
export const productListResponseSchema = listEnvelope(productSchema);
