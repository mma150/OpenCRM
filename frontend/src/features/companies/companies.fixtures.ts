import { managerUser } from "@/features/leads/leads.fixtures";
import { adminUser, repUser } from "@/test/render-with-store";

import type { Company, CompanyList, CompanyListQuery } from "./companies.types";

// A company with every field filled in.
export const northwind: Company = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  name: "Northwind Logistics",
  website: "https://northwind.example",
  industry: "Logistics",
  phone: "+1 555 234 8900",
  address: "4200 S Michigan Ave\nChicago, IL 60653",
  notes: "Renewal comes up in spring.",
  owner: { id: repUser.id, name: repUser.name },
  contactCount: 4,
  customFields: {},
  createdAt: "2026-10-05T09:00:00.000Z",
  updatedAt: "2026-10-06T09:00:00.000Z",
};

// A company with only the required field.
export const brightpath: Company = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  name: "Brightpath Dental",
  website: null,
  industry: null,
  phone: null,
  address: null,
  notes: null,
  owner: { id: adminUser.id, name: adminUser.name },
  contactCount: 0,
  customFields: {},
  createdAt: "2026-10-03T09:00:00.000Z",
  updatedAt: "2026-10-03T09:00:00.000Z",
};

// A website typed without a scheme, and one contact.
export const kestrel: Company = {
  ...brightpath,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
  name: "Kestrel Robotics",
  website: "kestrelrobotics.example",
  industry: "Robotics",
  owner: { id: managerUser.id, name: managerUser.name },
  contactCount: 1,
};

export const allCompanies: Company[] = [brightpath, kestrel, northwind];

export const industries = ["Logistics", "Robotics"];

// The query the list page sends for the plain /companies address.
export const defaultQuery: CompanyListQuery = {
  sort: "name",
  order: "asc",
  page: 1,
  pageSize: 25,
};

export function companyList(
  companies: Company[] = allCompanies,
  meta: Partial<CompanyList> = {},
): CompanyList {
  return { companies, page: 1, pageSize: 25, total: companies.length, ...meta };
}
