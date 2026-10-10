import type { components, paths } from "@/lib/api/schema";

// Every type comes from the generated schema, so a change to the API contract
// shows up here as a compile error instead of a runtime surprise (D-02).
type Schemas = components["schemas"];

// What can be imported from a CSV file: LEAD, CONTACT or COMPANY.
export type ImportType = Schemas["ImportType"];
// A field a column can be mapped to: the record's own, then its custom fields (`cf:<id>`).
export type ImportField = Schemas["ImportField"];
// What the API read from the file before anything is saved.
export type ImportPreview = Schemas["ImportPreview"];
export type ImportInput = Schemas["ImportBody"];
// What an import did, with the rows it could not save.
export type ImportResult = Schemas["ImportResult"];
export type ImportRowError = Schemas["ImportRowError"];

// Response bodies: { data, meta }.
export type ImportFieldsResponse =
  paths["/imports/fields"]["get"]["responses"]["200"]["content"]["application/json"];
export type ImportPreviewResponse =
  paths["/imports/preview"]["post"]["responses"]["200"]["content"]["application/json"];
export type ImportResponse =
  paths["/imports"]["post"]["responses"]["200"]["content"]["application/json"];
