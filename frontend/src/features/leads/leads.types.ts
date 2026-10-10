import type { components, paths } from "@/lib/api/schema";

// Every type comes from the generated schema, so a change to the API contract
// shows up here as a compile error instead of a runtime surprise (D-02).
type Schemas = components["schemas"];

export type Lead = Schemas["Lead"];
export type LeadStatus = Schemas["LeadStatus"];
// The statuses a user sets by hand. Lost and Converted are reached by their own actions.
export type OpenLeadStatus = Schemas["OpenLeadStatus"];
export type LeadSource = Schemas["LeadSource"];
// The schema's LostReason includes null (a lead that is not lost); a chosen reason never is.
export type LostReason = NonNullable<Schemas["LostReason"]>;

export type CreateLeadInput = Schemas["CreateLeadBody"];
export type UpdateLeadInput = Schemas["UpdateLeadBody"];
export type MarkLeadLostInput = { reason: LostReason; note?: string };
// What a lead becomes: a contact, and if asked a company and an opportunity.
export type ConvertLeadInput = Schemas["ConvertLeadBody"];

// When to remind the owner, and about what; `at: null` clears it.
export type FollowUpInput = Schemas["FollowUpBody"];

// Search, filters, sort and page of GET /leads.
export type LeadListQuery = NonNullable<paths["/leads"]["get"]["parameters"]["query"]>;
export type LeadSort = NonNullable<LeadListQuery["sort"]>;

// Response bodies: { data, meta }.
export type LeadsResponse =
  paths["/leads"]["get"]["responses"]["200"]["content"]["application/json"];
export type CreateLeadResponse =
  paths["/leads"]["post"]["responses"]["201"]["content"]["application/json"];
export type LeadResponse =
  paths["/leads/{id}"]["get"]["responses"]["200"]["content"]["application/json"];

// What the slice keeps for the list: one page of leads plus `meta` (page, pageSize, total).
export type LeadList = { leads: Lead[] } & Schemas["ListMeta"];
