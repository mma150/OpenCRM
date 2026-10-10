import { http } from "@/lib/api/http";

import type { PipelineStage, PipelineStagesResponse } from "./pipeline-stages.types";

// The pipeline in order: the open stages, then Won, then Lost. Every signed-in user may read
// it. The functions below it are for Admins, and each answers with the whole pipeline again.
export async function listPipelineStages(): Promise<PipelineStage[]> {
  const response = await http.get<PipelineStagesResponse>("/pipeline-stages");
  return response.data.data;
}

// Adds an open stage, last before Won.
export async function createPipelineStage(name: string): Promise<PipelineStage[]> {
  const response = await http.post<PipelineStagesResponse>("/pipeline-stages", { name });
  return response.data.data;
}

// Any stage can be renamed, Won and Lost included.
export async function renamePipelineStage(id: string, name: string): Promise<PipelineStage[]> {
  const response = await http.patch<PipelineStagesResponse>(`/pipeline-stages/${id}`, { name });
  return response.data.data;
}

// `ids` is every open stage, once, in the new order.
export async function reorderPipelineStages(ids: string[]): Promise<PipelineStage[]> {
  const response = await http.put<PipelineStagesResponse>("/pipeline-stages/order", { ids });
  return response.data.data;
}

// A stage that holds opportunities needs `moveToStageId`, the open stage that takes them.
export async function deletePipelineStage(
  id: string,
  moveToStageId?: string,
): Promise<PipelineStage[]> {
  const response = await http.delete<PipelineStagesResponse>(`/pipeline-stages/${id}`, {
    data: moveToStageId ? { moveToStageId } : undefined,
  });
  return response.data.data;
}
