import type { components, paths } from "@/lib/api/schema";

// Every type comes from the generated schema, so a change to the API contract
// shows up here as a compile error instead of a runtime surprise (D-02).
type Schemas = components["schemas"];

export type Company = Schemas["Company"];
// A company as another record names it (a contact's company) and as the picker hands it over.
export type CompanyRef = Pick<Company, "id" | "name">;

export type CreateCompanyInput = Schemas["CreateCompanyBody"];
export type UpdateCompanyInput = Schemas["UpdateCompanyBody"];

// Search, filters, sort and page of GET /companies.
export type CompanyListQuery = NonNullable<paths["/companies"]["get"]["parameters"]["query"]>;
export type CompanySort = NonNullable<CompanyListQuery["sort"]>;

// Response bodies: { data, meta }.
export type CompaniesResponse =
  paths["/companies"]["get"]["responses"]["200"]["content"]["application/json"];
export type CreateCompanyResponse =
  paths["/companies"]["post"]["responses"]["201"]["content"]["application/json"];
export type CompanyResponse =
  paths["/companies/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type IndustriesResponse =
  paths["/companies/industries"]["get"]["responses"]["200"]["content"]["application/json"];

// What the slice keeps for the list: one page of companies plus `meta` (page, pageSize, total).
export type CompanyList = { companies: Company[] } & Schemas["ListMeta"];
