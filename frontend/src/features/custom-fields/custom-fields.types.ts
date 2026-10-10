import type { components, paths } from "@/lib/api/schema";

// Every type comes from the generated schema, so a change to the API contract
// shows up here as a compile error instead of a runtime surprise (D-02).
type Schemas = components["schemas"];

// The definition of a field an Admin added to a kind of record.
export type CustomField = Schemas["CustomField"];
// LEAD, CONTACT, COMPANY or OPPORTUNITY. Fixed when the field is created.
export type CustomFieldRecordType = Schemas["CustomFieldRecordType"];
// TEXT, NUMBER, DATE or DROPDOWN. Fixed when the field is created.
export type CustomFieldType = Schemas["CustomFieldType"];
// What a record holds for its fields: { [field id]: value }, null where it has none.
export type CustomFieldValues = Schemas["CustomFieldValues"];

export type CreateCustomFieldInput = Schemas["CreateCustomFieldBody"];
export type UpdateCustomFieldInput = Schemas["UpdateCustomFieldBody"];

// Response bodies: { data, meta }.
export type CustomFieldsResponse =
  paths["/custom-fields"]["get"]["responses"]["200"]["content"]["application/json"];
export type CustomFieldResponse =
  paths["/custom-fields"]["post"]["responses"]["201"]["content"]["application/json"];
