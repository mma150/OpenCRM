import { customFieldRecordTypeSchema, customFieldTypeSchema } from "../../lib/custom-fields";
import { envelope, z } from "../../lib/openapi";

export const customFieldSchema = z
  .object({
    id: z.string(),
    recordType: customFieldRecordTypeSchema,
    label: z.string(),
    type: customFieldTypeSchema,
    // The choices of a DROPDOWN, in order. Empty for every other type.
    options: z.array(z.string()),
    required: z.boolean(),
    // Where the field stands among the fields of its record type. Lists are already in
    // this order; the numbers can have gaps.
    position: z.number().int(),
    archived: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("CustomField");

export type ApiCustomField = z.infer<typeof customFieldSchema>;

// The most fields one record type can have in use. Archived fields do not count.
export const MAX_ACTIVE_CUSTOM_FIELDS = 30;
export const MAX_DROPDOWN_OPTIONS = 50;

const NO_CONTROL_CHARACTERS = /^\P{Cc}*$/u;

// A label is also a column header in an export, so it holds no control characters.
const labelSchema = z
  .string()
  .trim()
  .min(1, "Enter a label")
  .max(60)
  .regex(NO_CONTROL_CHARACTERS, "Remove the control characters from the label");

const optionsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Enter the option")
      .max(100)
      .regex(NO_CONTROL_CHARACTERS, "Remove the control characters from the option"),
  )
  .max(MAX_DROPDOWN_OPTIONS);

export const createCustomFieldBodySchema = z
  .strictObject({
    recordType: customFieldRecordTypeSchema,
    label: labelSchema,
    type: customFieldTypeSchema,
    // Needed for a DROPDOWN (at least one), refused for the other types.
    options: optionsSchema.optional(),
    // Defaults to false.
    required: z.boolean().optional(),
  })
  .openapi("CreateCustomFieldBody");

export type CreateCustomFieldBody = z.infer<typeof createCustomFieldBodySchema>;

// Only the keys that are sent are changed. The record type and the type of a field are
// fixed when it is created.
export const updateCustomFieldBodySchema = z
  .strictObject({
    label: labelSchema.optional(),
    // The whole new list, in order. Only for a DROPDOWN.
    options: optionsSchema.optional(),
    required: z.boolean().optional(),
  })
  .openapi("UpdateCustomFieldBody");

export type UpdateCustomFieldBody = z.infer<typeof updateCustomFieldBodySchema>;

// Every field of the record type that is in use (not archived), once, in the new order.
export const reorderCustomFieldsBodySchema = z
  .strictObject({
    recordType: customFieldRecordTypeSchema,
    ids: z.array(z.uuid()).max(MAX_ACTIVE_CUSTOM_FIELDS),
  })
  .openapi("ReorderCustomFieldsBody");

export type ReorderCustomFieldsBody = z.infer<typeof reorderCustomFieldsBodySchema>;

export const customFieldListQuerySchema = z.object({
  // Left out: the fields of every record type.
  recordType: customFieldRecordTypeSchema.optional(),
  // Admin only: also the archived fields, after the fields in use of their record type.
  includeArchived: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type CustomFieldListQuery = z.infer<typeof customFieldListQuerySchema>;

export const customFieldResponseSchema = envelope(customFieldSchema);
export const customFieldListResponseSchema = envelope(z.array(customFieldSchema));
