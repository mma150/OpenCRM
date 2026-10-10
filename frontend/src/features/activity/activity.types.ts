import type { components, paths } from "@/lib/api/schema";

// Every type comes from the generated schema, so a change to the API contract
// shows up here as a compile error instead of a runtime surprise (D-02).
type Schemas = components["schemas"];

// A timeline entry plus the record it was made on.
export type ActivityEntry = Schemas["ActivityEntry"];
// How many conversations, notes and status changes the filters match, on every page.
export type ActivitySummary = Schemas["ActivitySummary"];
// Someone whose entries the signed-in user may see: a choice in the Person filter.
export type ActivityAuthor = Schemas["ActivityAuthor"];

// Person, date range, kind and page of GET /activity.
export type ActivityListQuery = NonNullable<paths["/activity"]["get"]["parameters"]["query"]>;

// Response bodies: { data, meta }.
export type ActivityResponse =
  paths["/activity"]["get"]["responses"]["200"]["content"]["application/json"];
export type ActivityAuthorsResponse =
  paths["/activity/authors"]["get"]["responses"]["200"]["content"]["application/json"];

// What the slice keeps for the feed: one page of entries plus `meta`
// (page, pageSize, total and the summary).
export type ActivityList = { entries: ActivityEntry[] } & Schemas["ActivityMeta"];
