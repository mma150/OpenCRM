import type { SelectOption } from "@/components/shared/select-control";

import type { PipelineStage, StageKind } from "./pipeline-stages.types";

// What a stage's kind is called. The name of a stage is an Admin's choice and is shown as it
// is; these words are for the status of an opportunity.
export const STAGE_KIND_LABELS: Record<StageKind, string> = {
  OPEN: "Open",
  WON: "Won",
  LOST: "Lost",
};

export const STAGE_KINDS = Object.keys(STAGE_KIND_LABELS) as StageKind[];

// The steps of the pipeline, in order: what an opportunity can be moved to. Won and Lost are
// reached by closing it.
export function openStages(stages: PipelineStage[] | null): PipelineStage[] {
  return (stages ?? []).filter((stage) => stage.kind === "OPEN");
}

export function stageOptions(stages: PipelineStage[]): SelectOption[] {
  return stages.map((stage) => ({ value: stage.id, label: stage.name }));
}
