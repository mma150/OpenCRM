import { customFieldInputSchema, customFieldValuesSchema } from "../../lib/custom-fields";
import { listEnvelope, listQuerySchema } from "../../lib/list-query";
import { envelope, z } from "../../lib/openapi";
import {
  optionalEmailSchema,
  optionalText,
  recordLinkSchema,
  recordOwnerSchema,
} from "../../lib/record-fields";
import { timeZoneSchema } from "../../lib/time-zone";
import { nameSchema } from "../../lib/user-fields";

export const contactSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    // First and last name together, for lists and headings.
    name: z.string(),
    jobTitle: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    // null when the contact has no company, or has one the caller may not see.
    company: z.object({ id: z.string(), name: z.string() }).nullable(),
    notes: z.string().nullable(),
    owner: recordOwnerSchema,
    // The lead that was converted into this contact, if there is one the caller may see
    // (the latest, should several leads have been converted into one contact).
    convertedFromLead: recordLinkSchema.nullable(),
    // When the latest logged conversation happened; null until the first one.
    lastContactAt: z.string().nullable(),
    // One key per custom field of contacts that is in use; null where there is no value.
    customFields: customFieldValuesSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Contact");

// Named ApiContact in code because `Contact` is the Prisma row.
export type ApiContact = z.infer<typeof contactSchema>;

const contactFields = {
  jobTitle: optionalText(100),
  email: optionalEmailSchema,
  phone: optionalText(50),
  // Must be a company the caller may see. null means no company.
  companyId: z.uuid().nullable().optional(),
  notes: optionalText(10_000),
  // { "<custom field id>": value }. On PATCH only the keys sent change; null clears one.
  customFields: customFieldInputSchema,
};

export const createContactBodySchema = z
  .strictObject({
    firstName: nameSchema,
    lastName: nameSchema,
    ...contactFields,
    // Defaults to the caller. Must be someone the caller may assign records to.
    ownerId: z.uuid().optional(),
  })
  .openapi("CreateContactBody");

export type CreateContactBody = z.infer<typeof createContactBodySchema>;

// Only the keys that are sent are changed; null clears a field that can be empty, and
// `companyId: null` takes the contact out of its company. The owner is changed with the
// assign route.
export const updateContactBodySchema = z
  .strictObject({
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    ...contactFields,
  })
  .openapi("UpdateContactBody");

export type UpdateContactBody = z.infer<typeof updateContactBodySchema>;

export const assignContactBodySchema = z
  .strictObject({ ownerId: z.uuid() })
  .openapi("AssignContactBody");

export const contactListQuerySchema = listQuerySchema(
  ["name", "company", "createdAt", "updatedAt", "lastContactAt"],
  "name",
  "asc",
).extend({
  companyId: z.uuid().optional(),
  ownerId: z.uuid().optional(),
});

export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

// The export takes what the list takes (paging is ignored), and the viewer's time zone for
// the times in the file.
export const contactExportQuerySchema = contactListQuerySchema.extend({ tz: timeZoneSchema });

export type ContactExportQuery = z.infer<typeof contactExportQuerySchema>;

export const contactResponseSchema = envelope(contactSchema);
export const contactListResponseSchema = listEnvelope(contactSchema);
