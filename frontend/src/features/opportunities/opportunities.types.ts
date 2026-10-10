import type { CustomFilterParams } from "@/components/shared/list-url-state";
import type { components, paths } from "@/lib/api/schema";

// Every type comes from the generated schema, so a change to the API contract
// shows up here as a compile error instead of a runtime surprise (D-02).
type Schemas = components["schemas"];

export type Opportunity = Schemas["Opportunity"];
// OPEN until it is closed as WON or LOST: always the kind of the stage it is in.
export type OpportunityStatus = Opportunity["status"];
export type CloseOutcome = Schemas["CloseOpportunityBody"]["outcome"];

export type CreateOpportunityInput = Schemas["CreateOpportunityBody"];
export type UpdateOpportunityInput = Schemas["UpdateOpportunityBody"];
export type CloseOpportunityInput = { outcome: CloseOutcome; reason?: string };

// When to remind the owner, and about what; `at: null` clears it.
export type FollowUpInput = Schemas["FollowUpBody"];

// Search, filters, sort and page of GET /opportunities, and the custom field filters
// (`cf.<field id>`), which the schema cannot list because their names depend on data.
export type OpportunityListQuery = NonNullable<
  paths["/opportunities"]["get"]["parameters"]["query"]
> &
  CustomFilterParams;
export type OpportunitySort = NonNullable<OpportunityListQuery["sort"]>;

// The search text, the owner and the custom field filters of GET /opportunities/board.
export type BoardQuery = NonNullable<paths["/opportunities/board"]["get"]["parameters"]["query"]> &
  CustomFilterParams;
// One stage of the board: its count and total value (of every opportunity in it) and its
// cards (the 50 changed most recently).
export type BoardColumn = Schemas["PipelineBoardColumn"];

// Response bodies: { data, meta }.
export type OpportunitiesResponse =
  paths["/opportunities"]["get"]["responses"]["200"]["content"]["application/json"];
export type CreateOpportunityResponse =
  paths["/opportunities"]["post"]["responses"]["201"]["content"]["application/json"];
export type OpportunityResponse =
  paths["/opportunities/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type BoardResponse =
  paths["/opportunities/board"]["get"]["responses"]["200"]["content"]["application/json"];

// What the slice keeps for the list: one page of opportunities plus `meta` (page, pageSize, total).
export type OpportunityList = { opportunities: Opportunity[] } & Schemas["ListMeta"];
