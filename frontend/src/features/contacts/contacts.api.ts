import { type DownloadedFile, downloadExport } from "@/lib/api/download";
import { http } from "@/lib/api/http";

import type {
  Contact,
  ContactList,
  ContactListQuery,
  ContactResponse,
  ContactsResponse,
  CreateContactInput,
  CreateContactResponse,
  UpdateContactInput,
} from "./contacts.types";

// One page of the contacts the signed-in user may see. `meta.total` counts every match.
// `companyId` narrows it to one company's contacts.
export async function listContacts(query: ContactListQuery): Promise<ContactList> {
  const response = await http.get<ContactsResponse>("/contacts", { params: query });
  return { contacts: response.data.data, ...response.data.meta };
}

// The list as a CSV file: every match of the same search, filters and sort order, not one
// page. Every role that can see the list may export it.
export function exportContacts(query: ContactListQuery): Promise<DownloadedFile> {
  return downloadExport("/contacts/export", query, "contacts.csv");
}

export async function getContact(id: string): Promise<Contact> {
  const response = await http.get<ContactResponse>(`/contacts/${id}`);
  return response.data.data;
}

export async function createContact(input: CreateContactInput): Promise<Contact> {
  const response = await http.post<CreateContactResponse>("/contacts", input);
  return response.data.data;
}

// `companyId: null` takes the contact out of its company.
export async function updateContact(id: string, input: UpdateContactInput): Promise<Contact> {
  const response = await http.patch<ContactResponse>(`/contacts/${id}`, input);
  return response.data.data;
}

// Admin and Sales Manager only; the API answers FORBIDDEN to everyone else.
export async function assignContact(id: string, ownerId: string): Promise<Contact> {
  const response = await http.post<ContactResponse>(`/contacts/${id}/assign`, { ownerId });
  return response.data.data;
}

export async function deleteContact(id: string): Promise<void> {
  await http.delete(`/contacts/${id}`);
}
