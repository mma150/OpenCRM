import { http } from "@/lib/api/http";

import type {
  ConvertLeadInput,
  CreateLeadInput,
  CreateLeadResponse,
  FollowUpInput,
  Lead,
  LeadList,
  LeadListQuery,
  LeadResponse,
  LeadsResponse,
  MarkLeadLostInput,
  UpdateLeadInput,
} from "./leads.types";

// One page of the leads the signed-in user may see. `meta.total` counts every match.
export async function listLeads(query: LeadListQuery): Promise<LeadList> {
  const response = await http.get<LeadsResponse>("/leads", { params: query });
  return { leads: response.data.data, ...response.data.meta };
}

export async function getLead(id: string): Promise<Lead> {
  const response = await http.get<LeadResponse>(`/leads/${id}`);
  return response.data.data;
}

export async function createLead(input: CreateLeadInput): Promise<Lead> {
  const response = await http.post<CreateLeadResponse>("/leads", input);
  return response.data.data;
}

// Also changes the status (New, Contacted, Qualified); doing so on a lost lead reopens it.
export async function updateLead(id: string, input: UpdateLeadInput): Promise<Lead> {
  const response = await http.patch<LeadResponse>(`/leads/${id}`, input);
  return response.data.data;
}

export async function markLeadLost(id: string, input: MarkLeadLostInput): Promise<Lead> {
  const response = await http.post<LeadResponse>(`/leads/${id}/mark-lost`, input);
  return response.data.data;
}

// Turns the lead into a contact and, if asked, a company and an opportunity. The answer is
// the lead, now CONVERTED, with `convertedTo` naming what it became.
export async function convertLead(id: string, input: ConvertLeadInput): Promise<Lead> {
  const response = await http.post<LeadResponse>(`/leads/${id}/convert`, input);
  return response.data.data;
}

// Admin and Sales Manager only; the API answers FORBIDDEN to everyone else.
export async function assignLead(id: string, ownerId: string): Promise<Lead> {
  const response = await http.post<LeadResponse>(`/leads/${id}/assign`, { ownerId });
  return response.data.data;
}

// Sets, moves or (with `at: null`) clears the follow-up reminder. The API refuses a new one
// on a converted or lost lead.
export async function setLeadFollowUp(id: string, input: FollowUpInput): Promise<Lead> {
  const response = await http.put<LeadResponse>(`/leads/${id}/follow-up`, input);
  return response.data.data;
}

export async function deleteLead(id: string): Promise<void> {
  await http.delete(`/leads/${id}`);
}
