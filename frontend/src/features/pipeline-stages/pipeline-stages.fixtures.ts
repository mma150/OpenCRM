import type { PipelineStage } from "./pipeline-stages.types";

function stage(
  position: number,
  name: string,
  kind: PipelineStage["kind"],
  opportunityCount: number,
): PipelineStage {
  return {
    id: `dddddddd-dddd-4ddd-8ddd-ddddddddddd${String(position)}`,
    name,
    position,
    kind,
    opportunityCount,
  };
}

// The pipeline a new installation starts with, in order.
export const newStage = stage(0, "New", "OPEN", 2);
export const qualifiedStage = stage(1, "Qualified", "OPEN", 1);
export const proposalStage = stage(2, "Proposal", "OPEN", 0);
export const negotiationStage = stage(3, "Negotiation", "OPEN", 0);
export const wonStage = stage(4, "Won", "WON", 1);
export const lostStage = stage(5, "Lost", "LOST", 1);

export const pipeline: PipelineStage[] = [
  newStage,
  qualifiedStage,
  proposalStage,
  negotiationStage,
  wonStage,
  lostStage,
];
