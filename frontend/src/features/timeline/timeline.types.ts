import type { components, paths } from "@/lib/api/schema";

// Every API type comes from the generated schema, so a change to the contract shows up
// here as a compile error instead of a runtime surprise (D-02).
type Schemas = components["schemas"];

export type TimelineEntry = Schemas["TimelineEntry"];
export type TimelineKind = Schemas["TimelineKind"];
export type ConversationType = Schemas["ConversationType"];

export type LogConversationInput = Schemas["LogConversationBody"];
export type AddNoteInput = Schemas["AddNoteBody"];

// The kind filter and the page of GET /leads/{id}/timeline. Every record type answers its
// timeline routes with the same shapes, so the lead's paths stand for all of them.
export type TimelineListQuery = NonNullable<
  paths["/leads/{id}/timeline"]["get"]["parameters"]["query"]
>;

// Response bodies: { data, meta }.
export type TimelineResponse =
  paths["/leads/{id}/timeline"]["get"]["responses"]["200"]["content"]["application/json"];
export type TimelineEntryResponse =
  paths["/leads/{id}/conversations"]["post"]["responses"]["201"]["content"]["application/json"];

// The record a timeline belongs to, and the record types there are: see `record-types.ts`.
export type { RecordRef, RecordType } from "./record-types";

// The tabs above the list. "SYSTEM" is what the API calls the entries it writes itself:
// created, status changes, reassignments and what happened to a quote or an invoice.
// There is no tab for emails: a fifth one does not fit a phone, and "All" shows them.
export type TimelineFilter =
  "ALL" | Extract<Schemas["TimelineKindFilter"], "CONVERSATION" | "NOTE" | "SYSTEM">;

// What the slice keeps: the entries loaded so far (the first page, plus any loaded with
// "Load more") and the `meta` of the last page asked for.
export type TimelinePage = { entries: TimelineEntry[] } & Schemas["ListMeta"];
