import type { Me } from "@/features/auth/auth.types";
import type { AssignableUser } from "@/features/users/users.types";
import { adminUser, repUser } from "@/test/render-with-store";

import type { Lead, LeadList, LeadListQuery } from "./leads.types";

// Signed-in users for the two roles the shared test helper does not have.
export const managerUser: Me = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Mia Manager",
  email: "mia@example.com",
  role: "SALES_MANAGER",
};

export const readOnlyUser: Me = {
  id: "77777777-7777-4777-8777-777777777777",
  name: "Rae Readonly",
  email: "rae@example.com",
  role: "READ_ONLY",
};

// Who an Admin may assign leads to.
export const assignableUsers: AssignableUser[] = [
  { id: adminUser.id, name: adminUser.name, role: "ADMIN" },
  { id: managerUser.id, name: managerUser.name, role: "SALES_MANAGER" },
  { id: repUser.id, name: repUser.name, role: "SALES_REP" },
];

// A lead with every field filled in.
export const marcus: Lead = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  firstName: "Marcus",
  lastName: "Chen",
  name: "Marcus Chen",
  company: "Northwind Logistics",
  jobTitle: "Director of Operations",
  email: "m.chen@northwind.example",
  phone: "+1 555 234 8901",
  source: "WEBSITE",
  status: "CONTACTED",
  owner: { id: repUser.id, name: repUser.name },
  estimatedValue: 48000,
  notes: "Wants a fleet pricing proposal.",
  lostReason: null,
  lostNote: null,
  lostAt: null,
  lastContactAt: "2026-09-20T08:30:00.000Z",
  followUpAt: null,
  followUpNote: null,
  convertedAt: null,
  convertedTo: null,
  customFields: {},
  createdAt: "2026-10-05T09:00:00.000Z",
  updatedAt: "2026-10-06T09:00:00.000Z",
};

// A lead with only the required fields.
export const liam: Lead = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  firstName: "Liam",
  lastName: "Gallagher",
  name: "Liam Gallagher",
  company: null,
  jobTitle: null,
  email: null,
  phone: null,
  source: "COLD_CALL",
  status: "NEW",
  owner: { id: adminUser.id, name: adminUser.name },
  estimatedValue: null,
  notes: null,
  lostReason: null,
  lostNote: null,
  lostAt: null,
  lastContactAt: null,
  followUpAt: null,
  followUpNote: null,
  convertedAt: null,
  convertedTo: null,
  customFields: {},
  createdAt: "2026-10-03T09:00:00.000Z",
  updatedAt: "2026-10-03T09:00:00.000Z",
};

export const devon: Lead = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  firstName: "Devon",
  lastName: "Vance",
  name: "Devon Vance",
  company: "Vance Industrial Supply",
  jobTitle: null,
  email: "devon@vance.example",
  phone: null,
  source: "REFERRAL",
  status: "LOST",
  owner: { id: repUser.id, name: repUser.name },
  estimatedValue: 1250.5,
  notes: null,
  lostReason: "CHOSE_COMPETITOR",
  lostNote: "Went with FleetTrack.",
  lostAt: "2026-10-07T09:00:00.000Z",
  lastContactAt: "2026-09-15T15:00:00.000Z",
  followUpAt: null,
  followUpNote: null,
  convertedAt: null,
  convertedTo: null,
  customFields: {},
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-07T09:00:00.000Z",
};

export const claire: Lead = {
  ...liam,
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
  firstName: "Claire",
  lastName: "Beaumont",
  name: "Claire Beaumont",
  status: "CONVERTED",
};

// A converted lead, with the records it became.
export const converted: Lead = {
  ...marcus,
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
  status: "CONVERTED",
  convertedAt: "2026-10-08T09:00:00.000Z",
  convertedTo: {
    contact: { id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", name: "Marcus Chen" },
    company: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", name: "Northwind Logistics" },
    opportunity: { id: "ffffffff-ffff-4fff-8fff-fffffffffff1", name: "Fleet Expansion" },
  },
};

export const allLeads: Lead[] = [marcus, liam, devon, claire];

// The query the list page sends for the plain /leads address.
export const defaultQuery: LeadListQuery = {
  sort: "createdAt",
  order: "desc",
  page: 1,
  pageSize: 25,
};

export function leadList(leads: Lead[] = allLeads, meta: Partial<LeadList> = {}): LeadList {
  return { leads, page: 1, pageSize: 25, total: leads.length, ...meta };
}
