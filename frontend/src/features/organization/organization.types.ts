import type { components, paths } from "@/lib/api/schema";

type Schemas = components["schemas"];

// Who the quotes and invoices are from, and what a new quote starts with.
export type OrganizationSettings = Schemas["OrganizationSettings"];
// PUT replaces the settings: a text left out is cleared, a number left out goes back to
// its default.
export type UpdateOrganizationInput = Schemas["UpdateOrganizationBody"];

export type OrganizationResponse =
  paths["/settings/organization"]["get"]["responses"]["200"]["content"]["application/json"];
