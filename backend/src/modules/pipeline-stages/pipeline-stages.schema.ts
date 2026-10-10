import { envelope, z } from "../../lib/openapi";

// OPEN stages are the steps of the pipeline. WON and LOST are where a closed opportunity
// rests: there is exactly one of each.
export const stageKindSchema = z.enum(["OPEN", "WON", "LOST"]).openapi("StageKind");

export type StageKind = z.infer<typeof stageKindSchema>;

export const pipelineStageSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    // The stage's place in the pipeline, counted from 0: the open stages in their order,
    // then Won, then Lost.
    position: z.number().int(),
    kind: stageKindSchema,
    // The opportunities in the stage that the caller may see.
    opportunityCount: z.number().int(),
  })
  .openapi("PipelineStage");

export type ApiPipelineStage = z.infer<typeof pipelineStageSchema>;

// The most open stages a pipeline can have. The board shows one column for each.
export const MAX_OPEN_STAGES = 20;

const stageNameSchema = z.string().trim().min(1, "Enter a name").max(50);

export const createPipelineStageBodySchema = z
  .strictObject({ name: stageNameSchema })
  .openapi("CreatePipelineStageBody");

export const updatePipelineStageBodySchema = z
  .strictObject({ name: stageNameSchema })
  .openapi("UpdatePipelineStageBody");

// Every open stage, once, in the new order.
export const reorderPipelineStagesBodySchema = z
  .strictObject({ ids: z.array(z.uuid()).min(1).max(MAX_OPEN_STAGES) })
  .openapi("ReorderPipelineStagesBody");

// The body may be left out when the stage holds no opportunities.
export const deletePipelineStageBodySchema = z
  .strictObject({
    // The open stage that takes over the deleted stage's opportunities.
    moveToStageId: z.uuid().optional(),
  })
  .openapi("DeletePipelineStageBody");

// Every route answers with the whole pipeline, in order.
export const pipelineStagesResponseSchema = envelope(z.array(pipelineStageSchema));
