import { http } from "@/lib/api/http";

import type {
  CreateCustomFieldInput,
  CustomField,
  CustomFieldRecordType,
  CustomFieldResponse,
  CustomFieldsResponse,
  UpdateCustomFieldInput,
} from "./custom-fields.types";

// The fields in use of one record type, in the Admin's order. Every signed-in user may
// read them: forms, record pages and list filters are drawn from them.
export async function listCustomFields(recordType: CustomFieldRecordType): Promise<CustomField[]> {
  const response = await http.get<CustomFieldsResponse>("/custom-fields", {
    params: { recordType },
  });
  return response.data.data;
}

// The same with the archived fields after them. Admin only; FORBIDDEN for everyone else.
export async function listAllCustomFields(
  recordType: CustomFieldRecordType,
): Promise<CustomField[]> {
  const response = await http.get<CustomFieldsResponse>("/custom-fields", {
    params: { recordType, includeArchived: "true" },
  });
  return response.data.data;
}

// The functions below are for Admins.

// Added last among the fields of its record type.
export async function createCustomField(input: CreateCustomFieldInput): Promise<CustomField> {
  const response = await http.post<CustomFieldResponse>("/custom-fields", input);
  return response.data.data;
}

// The label, the options (the whole list) and whether it is required. The record type and
// the type of a field never change.
export async function updateCustomField(
  id: string,
  input: UpdateCustomFieldInput,
): Promise<CustomField> {
  const response = await http.patch<CustomFieldResponse>(`/custom-fields/${id}`, input);
  return response.data.data;
}

// `ids` is every field in use of the record type, once, in the new order. Answers with
// every field of the record type, archived ones last.
export async function reorderCustomFields(
  recordType: CustomFieldRecordType,
  ids: string[],
): Promise<CustomField[]> {
  const response = await http.put<CustomFieldsResponse>("/custom-fields/order", {
    recordType,
    ids,
  });
  return response.data.data;
}

// Hides the field everywhere and keeps its values.
export async function archiveCustomField(id: string): Promise<CustomField> {
  const response = await http.post<CustomFieldResponse>(`/custom-fields/${id}/archive`);
  return response.data.data;
}

// Puts an archived field back, last among the fields in use.
export async function restoreCustomField(id: string): Promise<CustomField> {
  const response = await http.post<CustomFieldResponse>(`/custom-fields/${id}/restore`);
  return response.data.data;
}

// Only an archived field. Removes it and its value from every record, for good.
export async function deleteCustomField(id: string): Promise<void> {
  await http.delete(`/custom-fields/${id}`);
}
