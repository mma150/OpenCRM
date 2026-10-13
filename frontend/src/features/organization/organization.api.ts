import { http } from "@/lib/api/http";

import type {
  OrganizationResponse,
  OrganizationSettings,
  UpdateOrganizationInput,
} from "./organization.types";

// For every signed-in user: the details are printed on every quote and invoice.
export async function getOrganization(): Promise<OrganizationSettings> {
  const response = await http.get<OrganizationResponse>("/settings/organization");
  return response.data.data;
}

// Admin only. Replaces the settings.
export async function saveOrganization(
  input: UpdateOrganizationInput,
): Promise<OrganizationSettings> {
  const response = await http.put<OrganizationResponse>("/settings/organization", input);
  return response.data.data;
}
