import type { components, paths } from "@/lib/api/schema";

// Every type comes from the generated schema, so a change to the API contract
// shows up here as a compile error instead of a runtime surprise (D-02).
type Schemas = components["schemas"];

export type Contact = Schemas["Contact"];

export type CreateContactInput = Schemas["CreateContactBody"];
export type UpdateContactInput = Schemas["UpdateContactBody"];

// Search, filters, sort and page of GET /contacts.
export type ContactListQuery = NonNullable<paths["/contacts"]["get"]["parameters"]["query"]>;
export type ContactSort = NonNullable<ContactListQuery["sort"]>;

// Response bodies: { data, meta }.
export type ContactsResponse =
  paths["/contacts"]["get"]["responses"]["200"]["content"]["application/json"];
export type CreateContactResponse =
  paths["/contacts"]["post"]["responses"]["201"]["content"]["application/json"];
export type ContactResponse =
  paths["/contacts/{id}"]["get"]["responses"]["200"]["content"]["application/json"];

// What the slice keeps for the list: one page of contacts plus `meta` (page, pageSize, total).
export type ContactList = { contacts: Contact[] } & Schemas["ListMeta"];
