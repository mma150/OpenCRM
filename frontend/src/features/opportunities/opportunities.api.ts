import { http } from "@/lib/api/http";

import type {
  BoardColumn,
  BoardQuery,
  BoardResponse,
  CloseOpportunityInput,
  CreateOpportunityInput,
  CreateOpportunityResponse,
  FollowUpInput,
  OpportunitiesResponse,
  Opportunity,
  OpportunityList,
  OpportunityListQuery,
  OpportunityResponse,
  UpdateOpportunityInput,
} from "./opportunities.types";

// One page of the opportunities the signed-in user may see. `meta.total` counts every match.
export async function listOpportunities(query: OpportunityListQuery): Promise<OpportunityList> {
  const response = await http.get<OpportunitiesResponse>("/opportunities", { params: query });
  return { opportunities: response.data.data, ...response.data.meta };
}

// The pipeline as columns, in order, Won and Lost included.
export async function getBoard(query: BoardQuery): Promise<BoardColumn[]> {
  const response = await http.get<BoardResponse>("/opportunities/board", { params: query });
  return response.data.data;
}

export async function getOpportunity(id: string): Promise<Opportunity> {
  const response = await http.get<OpportunityResponse>(`/opportunities/${id}`);
  return response.data.data;
}

export async function createOpportunity(input: CreateOpportunityInput): Promise<Opportunity> {
  const response = await http.post<CreateOpportunityResponse>("/opportunities", input);
  return response.data.data;
}

// The details only. The stage and the owner have their own requests below.
export async function updateOpportunity(
  id: string,
  input: UpdateOpportunityInput,
): Promise<Opportunity> {
  const response = await http.patch<OpportunityResponse>(`/opportunities/${id}`, input);
  return response.data.data;
}

// To an open stage. Won and Lost are reached with closeOpportunity.
export async function moveOpportunity(id: string, stageId: string): Promise<Opportunity> {
  const response = await http.post<OpportunityResponse>(`/opportunities/${id}/stage`, { stageId });
  return response.data.data;
}

// The reason is needed for LOST and optional for WON.
export async function closeOpportunity(
  id: string,
  input: CloseOpportunityInput,
): Promise<Opportunity> {
  const response = await http.post<OpportunityResponse>(`/opportunities/${id}/close`, input);
  return response.data.data;
}

// Back to the first open stage.
export async function reopenOpportunity(id: string): Promise<Opportunity> {
  const response = await http.post<OpportunityResponse>(`/opportunities/${id}/reopen`, {});
  return response.data.data;
}

// Admin and Sales Manager only; the API answers FORBIDDEN to everyone else.
export async function assignOpportunity(id: string, ownerId: string): Promise<Opportunity> {
  const response = await http.post<OpportunityResponse>(`/opportunities/${id}/assign`, { ownerId });
  return response.data.data;
}

// Sets, moves or (with `at: null`) clears the follow-up reminder. The API refuses a new one
// on a closed opportunity.
export async function setOpportunityFollowUp(
  id: string,
  input: FollowUpInput,
): Promise<Opportunity> {
  const response = await http.put<OpportunityResponse>(`/opportunities/${id}/follow-up`, input);
  return response.data.data;
}

export async function deleteOpportunity(id: string): Promise<void> {
  await http.delete(`/opportunities/${id}`);
}
