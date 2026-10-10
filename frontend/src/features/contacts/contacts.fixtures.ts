import { brightpath, northwind } from "@/features/companies/companies.fixtures";
import { adminUser, repUser } from "@/test/render-with-store";

import type { Contact, ContactList, ContactListQuery } from "./contacts.types";

// A contact with every field filled in.
export const marcus: Contact = {
  id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
  firstName: "Marcus",
  lastName: "Chen",
  name: "Marcus Chen",
  jobTitle: "Director of Operations",
  email: "m.chen@northwind.example",
  phone: "+1 555 234 8901",
  company: { id: northwind.id, name: northwind.name },
  notes: "Prefers a call before nine.",
  owner: { id: repUser.id, name: repUser.name },
  convertedFromLead: null,
  lastContactAt: "2026-09-20T08:30:00.000Z",
  createdAt: "2026-10-05T09:00:00.000Z",
  updatedAt: "2026-10-06T09:00:00.000Z",
};

// A contact with only the required fields.
export const liam: Contact = {
  id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
  firstName: "Liam",
  lastName: "Gallagher",
  name: "Liam Gallagher",
  jobTitle: null,
  email: null,
  phone: null,
  company: null,
  notes: null,
  owner: { id: adminUser.id, name: adminUser.name },
  convertedFromLead: null,
  lastContactAt: null,
  createdAt: "2026-10-03T09:00:00.000Z",
  updatedAt: "2026-10-03T09:00:00.000Z",
};

export const elena: Contact = {
  ...liam,
  id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
  firstName: "Elena",
  lastName: "Rostova",
  name: "Elena Rostova",
  jobTitle: "VP of Engineering",
  email: "elena@brightpath.example",
  company: { id: brightpath.id, name: brightpath.name },
  owner: { id: repUser.id, name: repUser.name },
};

export const allContacts: Contact[] = [elena, liam, marcus];

// The query the list page sends for the plain /contacts address.
export const defaultQuery: ContactListQuery = {
  sort: "name",
  order: "asc",
  page: 1,
  pageSize: 25,
};

export function contactList(
  contacts: Contact[] = allContacts,
  meta: Partial<ContactList> = {},
): ContactList {
  return { contacts, page: 1, pageSize: 25, total: contacts.length, ...meta };
}
