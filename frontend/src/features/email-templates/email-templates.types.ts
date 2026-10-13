import type { components, paths } from "@/lib/api/schema";

type Schemas = components["schemas"];

// A reusable email: plain text with {{placeholders}} in the subject and the body. `shared`
// templates are seen by everyone; `editable` says whether the signed-in user may change or
// delete this one.
export type EmailTemplate = Schemas["EmailTemplate"];
export type CreateEmailTemplateInput = Schemas["CreateEmailTemplateBody"];
export type UpdateEmailTemplateInput = Schemas["UpdateEmailTemplateBody"];
// One supported placeholder: `token` is what is typed ("{{contact.firstName}}").
export type EmailPlaceholder = Schemas["EmailPlaceholder"];

// Response bodies: { data, meta }.
export type EmailTemplatesResponse =
  paths["/email-templates"]["get"]["responses"]["200"]["content"]["application/json"];
export type EmailTemplateResponse =
  paths["/email-templates/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type CreateEmailTemplateResponse =
  paths["/email-templates"]["post"]["responses"]["201"]["content"]["application/json"];
export type EmailPlaceholdersResponse =
  paths["/email-templates/placeholders"]["get"]["responses"]["200"]["content"]["application/json"];
