import { customFieldInputSchema, customFieldValuesSchema } from "../../lib/custom-fields";
import { listEnvelope, listQuerySchema } from "../../lib/list-query";
import { envelope, z } from "../../lib/openapi";
import { optionalText, recordOwnerSchema } from "../../lib/record-fields";
import { timeZoneSchema } from "../../lib/time-zone";

export const companySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    website: z.string().nullable(),
    industry: z.string().nullable(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
    notes: z.string().nullable(),
    owner: recordOwnerSchema,
    // The contacts linked to the company that the caller may see.
    contactCount: z.number().int(),
    // One key per custom field of companies that is in use; null where there is no value.
    customFields: customFieldValuesSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Company");

// Named ApiCompany in code because `Company` is the Prisma row.
export type ApiCompany = z.infer<typeof companySchema>;

// Exported for converting a lead, which can create a company.
export const companyNameSchema = z.string().trim().min(1, "Enter a name").max(200);

// "example.com" or "https://example.com/about". The web app shows it as a link, so any other
// scheme (javascript:, data:) is refused here rather than trusted to every client.
const websiteSchema = optionalText(200).refine(
  (value) => !value || /^(https?:\/\/)?[^\s:/]+\.\S+$/i.test(value),
  "Enter a web address such as example.com",
);

const companyFields = {
  website: websiteSchema,
  // Free text; GET /companies/industries lists the values in use.
  industry: optionalText(100),
  phone: optionalText(50),
  address: optionalText(500),
  notes: optionalText(10_000),
  // { "<custom field id>": value }. On PATCH only the keys sent change; null clears one.
  customFields: customFieldInputSchema,
};

export const createCompanyBodySchema = z
  .strictObject({
    name: companyNameSchema,
    ...companyFields,
    // Defaults to the caller. Must be someone the caller may assign records to.
    ownerId: z.uuid().optional(),
  })
  .openapi("CreateCompanyBody");

export type CreateCompanyBody = z.infer<typeof createCompanyBodySchema>;

// Only the keys that are sent are changed; null clears a field that can be empty.
// The owner is changed with the assign route.
export const updateCompanyBodySchema = z
  .strictObject({ name: companyNameSchema.optional(), ...companyFields })
  .openapi("UpdateCompanyBody");

export type UpdateCompanyBody = z.infer<typeof updateCompanyBodySchema>;

export const assignCompanyBodySchema = z
  .strictObject({ ownerId: z.uuid() })
  .openapi("AssignCompanyBody");

export const companyListQuerySchema = listQuerySchema(
  ["name", "industry", "createdAt", "updatedAt"],
  "name",
  "asc",
).extend({
  // The whole industry, whatever the case: "retail" finds "Retail".
  industry: z.string().trim().min(1).max(100).optional(),
  ownerId: z.uuid().optional(),
});

export type CompanyListQuery = z.infer<typeof companyListQuerySchema>;

// The export takes what the list takes (paging is ignored), and the viewer's time zone for
// the times in the file.
export const companyExportQuerySchema = companyListQuerySchema.extend({ tz: timeZoneSchema });

export type CompanyExportQuery = z.infer<typeof companyExportQuerySchema>;

export const companyResponseSchema = envelope(companySchema);
export const companyListResponseSchema = listEnvelope(companySchema);
export const industriesResponseSchema = envelope(z.array(z.string()));
