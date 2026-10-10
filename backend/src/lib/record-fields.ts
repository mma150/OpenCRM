import { envelope, z } from "./openapi";

// Field schemas shared by the owned records (leads, contacts, companies, opportunities), so every form
// field of one kind follows the same rules.

// The `:id` of a record in a path.
export const recordIdParamsSchema = z.object({ id: z.uuid() });

// The answer to deleting a record.
export const deletedResponseSchema = envelope(z.null());

// The owner as every record shows it.
export const recordOwnerSchema = z.object({ id: z.string(), name: z.string() });

// Another record as a record shows it: enough to name it and link to it.
export const recordLinkSchema = z.object({ id: z.string(), name: z.string() });

// Money with at most two decimals, within what a Decimal(12, 2) column holds.
export const moneySchema = z
  .number()
  .min(0)
  .max(9_999_999_999.99)
  .multipleOf(0.01, "Use at most two decimal places");

// A calendar day without a time, such as "2026-11-15".
export const daySchema = z.iso.date();

// An optional text field: trimmed, and an empty string means the same as null (no value).
export function optionalText(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();
}

// Stored trimmed and lowercased, like a user's email. Empty means no value.
export const optionalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((value) => value === "" || z.email().safeParse(value).success, "Enter a valid email")
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();
