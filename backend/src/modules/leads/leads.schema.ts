import { listEnvelope, listQuerySchema } from "../../lib/list-query";
import { envelope, z } from "../../lib/openapi";
import {
  daySchema,
  moneySchema,
  optionalEmailSchema,
  optionalText,
  recordLinkSchema,
  recordOwnerSchema,
} from "../../lib/record-fields";
import { nameSchema } from "../../lib/user-fields";
import { companyNameSchema } from "../companies/companies.schema";
import { opportunityNameSchema } from "../opportunities/opportunities.schema";

export const leadSourceSchema = z
  .enum(["WEBSITE", "REFERRAL", "COLD_CALL", "EVENT", "OTHER"])
  .openapi("LeadSource");

export const leadStatusSchema = z
  .enum(["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"])
  .openapi("LeadStatus");

// The statuses a lead can be moved to by editing it. LOST is set by mark-lost (it needs a
// reason) and CONVERTED by converting the lead.
export const openLeadStatusSchema = z
  .enum(["NEW", "CONTACTED", "QUALIFIED"])
  .openapi("OpenLeadStatus");

export const lostReasonSchema = z
  .enum(["PRICE", "CHOSE_COMPETITOR", "NO_BUDGET", "NO_RESPONSE", "OTHER"])
  .openapi("LostReason");

export const leadSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    // First and last name together, for lists and headings.
    name: z.string(),
    company: z.string().nullable(),
    jobTitle: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    source: leadSourceSchema,
    status: leadStatusSchema,
    owner: recordOwnerSchema,
    estimatedValue: z.number().nullable(),
    notes: z.string().nullable(),
    lostReason: lostReasonSchema.nullable(),
    lostNote: z.string().nullable(),
    lostAt: z.string().nullable(),
    // When the latest logged conversation happened; null until the first one.
    lastContactAt: z.string().nullable(),
    convertedAt: z.string().nullable(),
    // What a converted lead became; null until then. Inside it, each is null when there is
    // none (a lead can be converted without a company or an opportunity) or it is one the
    // caller may not see.
    convertedTo: z
      .object({
        contact: recordLinkSchema.nullable(),
        company: recordLinkSchema.nullable(),
        opportunity: recordLinkSchema.nullable(),
      })
      .nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Lead");

// Named ApiLead in code because `Lead` is the Prisma row.
export type ApiLead = z.infer<typeof leadSchema>;

const leadFields = {
  company: optionalText(200),
  jobTitle: optionalText(100),
  email: optionalEmailSchema,
  phone: optionalText(50),
  estimatedValue: moneySchema.nullable().optional(),
  notes: optionalText(10_000),
};

export const createLeadBodySchema = z
  .strictObject({
    firstName: nameSchema,
    lastName: nameSchema,
    source: leadSourceSchema,
    ...leadFields,
    // Defaults to the caller. Must be someone the caller may assign records to.
    ownerId: z.uuid().optional(),
  })
  .openapi("CreateLeadBody");

export type CreateLeadBody = z.infer<typeof createLeadBodySchema>;

// Only the keys that are sent are changed; null clears a field that can be empty.
// The owner is changed with the assign route.
export const updateLeadBodySchema = z
  .strictObject({
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    source: leadSourceSchema.optional(),
    ...leadFields,
    // Setting a status on a lost lead reopens it.
    status: openLeadStatusSchema.optional(),
  })
  .openapi("UpdateLeadBody");

export type UpdateLeadBody = z.infer<typeof updateLeadBodySchema>;

export const markLeadLostBodySchema = z
  .strictObject({ reason: lostReasonSchema, note: optionalText(1000) })
  .openapi("MarkLeadLostBody");

export type MarkLeadLostBody = z.infer<typeof markLeadLostBodySchema>;

export const assignLeadBodySchema = z.strictObject({ ownerId: z.uuid() }).openapi("AssignLeadBody");

export type AssignLeadBody = z.infer<typeof assignLeadBodySchema>;

// LEAD-04. The new records belong to the lead's owner.
export const convertLeadBodySchema = z
  .strictObject({
    // A new company, one the caller may see, or none.
    company: z.discriminatedUnion("mode", [
      z.strictObject({ mode: z.literal("create"), name: companyNameSchema }),
      z.strictObject({ mode: z.literal("existing"), id: z.uuid() }),
      z.strictObject({ mode: z.literal("none") }),
    ]),
    // A new contact with the lead's name, job title, email, phone and notes, or a contact
    // the caller may see (which is left as it is).
    contact: z.discriminatedUnion("mode", [
      z.strictObject({ mode: z.literal("create") }),
      z.strictObject({ mode: z.literal("existing"), id: z.uuid() }),
    ]),
    // The other keys count only when `create` is true.
    opportunity: z.strictObject({
      create: z.boolean(),
      // Defaults to the company's name, or else the lead's name.
      name: opportunityNameSchema.optional(),
      // Defaults to the lead's estimated value, or else 0.
      value: moneySchema.optional(),
      expectedCloseDate: daySchema.nullable().optional(),
      // An open stage. Defaults to the first one.
      stageId: z.uuid().optional(),
    }),
  })
  .openapi("ConvertLeadBody");

export type ConvertLeadBody = z.infer<typeof convertLeadBodySchema>;

export const leadListQuerySchema = listQuerySchema(
  ["name", "company", "status", "createdAt", "updatedAt", "lastContactAt"],
  "createdAt",
).extend({
  status: leadStatusSchema.optional(),
  source: leadSourceSchema.optional(),
  ownerId: z.uuid().optional(),
});

export type LeadListQuery = z.infer<typeof leadListQuerySchema>;

export const leadResponseSchema = envelope(leadSchema);
export const leadListResponseSchema = listEnvelope(leadSchema);
