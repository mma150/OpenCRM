import { http } from "@/lib/api/http";

import type {
  CompaniesResponse,
  Company,
  CompanyList,
  CompanyListQuery,
  CompanyResponse,
  CreateCompanyInput,
  CreateCompanyResponse,
  IndustriesResponse,
  UpdateCompanyInput,
} from "./companies.types";

// One page of the companies the signed-in user may see. `meta.total` counts every match.
export async function listCompanies(query: CompanyListQuery): Promise<CompanyList> {
  const response = await http.get<CompaniesResponse>("/companies", { params: query });
  return { companies: response.data.data, ...response.data.meta };
}

// The industries in use among those companies, for the Industry filter and the form's hints.
export async function listIndustries(): Promise<string[]> {
  const response = await http.get<IndustriesResponse>("/companies/industries");
  return response.data.data;
}

export async function getCompany(id: string): Promise<Company> {
  const response = await http.get<CompanyResponse>(`/companies/${id}`);
  return response.data.data;
}

export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  const response = await http.post<CreateCompanyResponse>("/companies", input);
  return response.data.data;
}

export async function updateCompany(id: string, input: UpdateCompanyInput): Promise<Company> {
  const response = await http.patch<CompanyResponse>(`/companies/${id}`, input);
  return response.data.data;
}

// Admin and Sales Manager only; the API answers FORBIDDEN to everyone else.
export async function assignCompany(id: string, ownerId: string): Promise<Company> {
  const response = await http.post<CompanyResponse>(`/companies/${id}/assign`, { ownerId });
  return response.data.data;
}

// The company's contacts stay, without a company.
export async function deleteCompany(id: string): Promise<void> {
  await http.delete(`/companies/${id}`);
}
